import fs from 'node:fs'
import path from 'node:path'
import type { ExecArgs } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, ProductStatus } from '@medusajs/framework/utils'
import {
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductTagsWorkflow,
  createProductsWorkflow,
  uploadFilesWorkflow,
} from '@medusajs/medusa/core-flows'

const GST_RATE = 18

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2)

function priceForCategory(catSlug: string, name: string): { price: number; mrp: number } {
  const lower = (catSlug + ' ' + name).toLowerCase()
  if (lower.includes('street') || lower.includes('flood')) return { price: 1899, mrp: 2499 }
  if (lower.includes('zenia') || lower.includes('distribution') || lower.includes('matris distribution')) return { price: 1299, mrp: 1699 }
  if (lower.includes('wire') || lower.includes('cable') || lower.includes('multistrand')) return { price: 1499, mrp: 1899 }
  if (lower.includes('fan') || lower.includes('bldc')) return { price: 2299, mrp: 2999 }
  if (lower.includes('mcb') || lower.includes('isolator') || lower.includes('elcb')) return { price: 349, mrp: 499 }
  if (lower.includes('downlight') || lower.includes('panel') || lower.includes('penal')) return { price: 449, mrp: 599 }
  if (lower.includes('bulb') || lower.includes('tubelight') || lower.includes('t5')) return { price: 199, mrp: 279 }
  if (lower.includes('plug') || lower.includes('holder') || lower.includes('box')) return { price: 129, mrp: 179 }
  return { price: 299, mrp: 399 }
}

export default async function seedBackupProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // 1. Resolve store foundations
  const { data: channels } = await query.graph({ entity: 'sales_channel', fields: ['id'], filters: { name: 'Safonix Web Store' } })
  const { data: locations } = await query.graph({ entity: 'stock_location', fields: ['id'], filters: { name: 'Safonix Warehouse' } })
  const { data: profiles } = await query.graph({ entity: 'shipping_profile', fields: ['id'] })
  if (!channels.length || !locations.length || !profiles.length) {
    throw new Error('Run "npm run seed" first (sales channel, warehouse or shipping profile missing).')
  }

  // 2. Read backup files
  const rootDir = path.resolve(process.cwd(), '../..')
  const backupDir = path.join(rootDir, 'backups', 'safonix-export-20261116')
  const uploadsDir = path.join(rootDir, 'apps', 'cms', 'public', 'uploads')

  const entitiesFile = path.join(backupDir, 'entities', 'entities_00001.jsonl')
  const linksFile = path.join(backupDir, 'links', 'links_00001.jsonl')

  if (!fs.existsSync(entitiesFile) || !fs.existsSync(linksFile)) {
    throw new Error(`Backup files not found in ${backupDir}`)
  }

  const entitiesLines = fs.readFileSync(entitiesFile, 'utf8').split('\n').filter((l) => l.trim().length > 0)
  const linksLines = fs.readFileSync(linksFile, 'utf8').split('\n').filter((l) => l.trim().length > 0)

  const uploadFiles = new Map<number, any>()
  const categories = new Map<number, any>()
  const rawProducts = new Map<number, any>()

  for (const line of entitiesLines) {
    const obj = JSON.parse(line)
    if (obj.type === 'plugin::upload.file') uploadFiles.set(obj.id, obj.data)
    else if (obj.type === 'api::category.category') categories.set(obj.id, obj.data)
    else if (obj.type === 'api::product.product') rawProducts.set(obj.id, obj.data)
  }

  logger.info(`Loaded ${categories.size} categories, ${rawProducts.size} products, ${uploadFiles.size} media files from backup.`)

  // Parse links
  const categoryParent = new Map<number, number>()
  const productCategory = new Map<number, number>()
  const productImages = new Map<number, number[]>()

  for (const line of linksLines) {
    const link = JSON.parse(line)
    if (link.left?.type === 'api::category.category' && link.left?.field === 'parent' && link.right?.type === 'api::category.category') {
      categoryParent.set(link.left.ref, link.right.ref)
    } else if (link.left?.type === 'api::product.product' && link.left?.field === 'category' && link.right?.type === 'api::category.category') {
      productCategory.set(link.left.ref, link.right.ref)
    } else if (link.left?.type === 'plugin::upload.file' && link.left?.field === 'related' && link.right?.type === 'api::product.product' && link.right?.field === 'images') {
      const fileId = link.left.ref
      const prodId = link.right.ref
      if (!productImages.has(prodId)) productImages.set(prodId, [])
      productImages.get(prodId)!.push(fileId)
    }
  }

  // 3. Create Categories in Medusa
  const { data: existingCategories } = await query.graph({ entity: 'product_category', fields: ['id', 'handle'] })
  const categoryHandleToId = new Map<string, string>(existingCategories.map((c: any) => [c.handle, c.id]))

  // Depth-first order for categories
  const depth = (id: number): number => {
    const p = categoryParent.get(id)
    return p ? 1 + depth(p) : 0
  }
  const orderedCategories = [...categories.entries()].sort(([aId, aData], [bId, bData]) => {
    return depth(aId) - depth(bId) || (aData.order ?? 0) - (bData.order ?? 0)
  })

  let createdCategories = 0
  for (const [id, cat] of orderedCategories) {
    if (categoryHandleToId.has(cat.slug)) continue
    const parentId = categoryParent.get(id)
    const parentCat = parentId ? categories.get(parentId) : undefined
    const parentMedusaId = parentCat ? categoryHandleToId.get(parentCat.slug) : undefined

    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: [
          {
            name: cat.name,
            handle: cat.slug,
            description: cat.tagline ?? undefined,
            is_active: true,
            parent_category_id: parentMedusaId,
            rank: cat.order ?? 0,
          },
        ],
      },
    })
    categoryHandleToId.set(cat.slug, result[0].id)
    createdCategories++
  }
  logger.info(`Categories created: ${createdCategories}, total available: ${categoryHandleToId.size}`)

  // 4. Upload Images
  const uploadedUrls = new Map<string, string>()
  async function uploadImageFile(fileData: any): Promise<string | null> {
    if (!fileData) return null
    const filename = path.basename(fileData.url ?? '')
    if (!filename) return null
    if (uploadedUrls.has(filename)) return uploadedUrls.get(filename)!

    let localPath = path.join(uploadsDir, filename)
    if (!fs.existsSync(localPath)) {
      localPath = path.join(backupDir, filename)
    }
    if (!fs.existsSync(localPath)) {
      logger.warn(`Image file not found on disk: ${filename}`)
      return null
    }

    try {
      const buffer = fs.readFileSync(localPath)
      const mimeType = fileData.mime ?? (filename.endsWith('.png') ? 'image/png' : 'image/jpeg')
      const { result } = await uploadFilesWorkflow(container).run({
        input: { files: [{ filename, mimeType, content: buffer.toString('base64'), access: 'public' }] },
      })
      uploadedUrls.set(filename, result[0].url)
      return result[0].url
    } catch (err) {
      logger.warn(`Could not upload ${filename}: ${(err as Error).message}`)
      return null
    }
  }

  // 5. Product Tags
  const { data: existingTags } = await query.graph({ entity: 'product_tag', fields: ['id', 'value'] })
  const tagIdMap = new Map<string, string>(existingTags.map((t: any) => [t.value, t.id]))
  async function getTagIds(values: string[]) {
    const missing = values.filter((v) => !tagIdMap.has(v))
    if (missing.length) {
      const { result } = await createProductTagsWorkflow(container).run({
        input: { product_tags: missing.map((value) => ({ value })) },
      })
      result.forEach((t: any) => tagIdMap.set(t.value, t.id))
    }
    return values.map((v) => tagIdMap.get(v)!).filter(Boolean)
  }

  // 6. Create Products
  const { data: existingProducts } = await query.graph({ entity: 'product', fields: ['id', 'handle'] })
  const existingHandles = new Set(existingProducts.map((p: any) => p.handle))

  const stockMap = new Map<string, number>()
  const usedSkus = new Set<string>()
  let createdCount = 0

  for (const [prodId, p] of rawProducts.entries()) {
    if (existingHandles.has(p.slug)) continue

    const catId = productCategory.get(prodId)
    const cat = catId ? categories.get(catId) : undefined
    const medusaCatId = cat ? categoryHandleToId.get(cat.slug) : undefined

    const fileIds = productImages.get(prodId) ?? []
    const images: { url: string }[] = []
    for (const fId of fileIds) {
      const fData = uploadFiles.get(fId)
      const url = await uploadImageFile(fData)
      if (url) images.push({ url })
    }

    const pricing = priceForCategory(cat?.slug ?? '', p.name)
    const priceAmount = typeof p.price === 'number' && p.price > 0 ? p.price : pricing.price
    const mrpAmount = typeof p.compareAtPrice === 'number' && p.compareAtPrice > 0 ? p.compareAtPrice : pricing.mrp

    let sku = String(p.sku ?? `SFX-${p.slug}`).toUpperCase().replace(/[^A-Z0-9-]/g, '-').replace(/-{2,}/g, '-')
    while (usedSkus.has(sku)) sku += '-1'
    usedSkus.add(sku)
    stockMap.set(sku, 50)

    const keywords = [...new Set([cat?.name, 'safonix', ...words(p.name)].filter(Boolean).map((k) => String(k).toLowerCase()))].slice(0, 10)

    const details = ((p.details ?? []) as any[]).map((row) => ({
      label: row.label,
      value: row.value ?? '',
      asList: Boolean(row.asList),
    }))

    const metadata = {
      mrp: mrpAmount,
      gst_rate: GST_RATE,
      min_order_qty: 1,
      certifications: ['ISI', 'BIS', 'CE'],
      datasheet_url: '',
      badge: p.badge || (p.featured ? 'Featured' : ''),
      featured: Boolean(p.featured),
      rating: typeof p.rating === 'number' ? p.rating : 4.8,
      review_count: typeof p.reviewCount === 'number' ? p.reviewCount : 24,
      unit: p.unit || 'piece',
      brief: p.brief || '',
      specifications: ((p.specifications ?? []) as any[]).map((s) => ({ label: s.label, value: s.value })),
      features: ((p.features ?? []) as any[]).map((f) => ({ title: f.title, description: f.description ?? '' })),
      details,
    }

    try {
      await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: p.name,
              handle: p.slug,
              subtitle: p.shortDescription ?? undefined,
              description: p.brief || p.description || undefined,
              status: ProductStatus.PUBLISHED,
              thumbnail: images[0]?.url,
              images,
              category_ids: medusaCatId ? [medusaCatId] : [],
              tag_ids: await getTagIds(keywords),
              sales_channels: [{ id: channels[0].id }],
              shipping_profile_id: profiles[0].id,
              options: [{ title: 'Option', values: ['Standard'] }],
              variants: [
                {
                  title: 'Standard',
                  sku,
                  manage_inventory: true,
                  allow_backorder: false,
                  options: { Option: 'Standard' },
                  prices: [{ amount: priceAmount, currency_code: 'inr' }],
                },
              ],
              metadata,
            },
          ],
        },
      })
      createdCount++
      logger.info(`Created product: ${p.name} (SKU: ${sku}, INR ${priceAmount})`)
    } catch (err) {
      logger.error(`Failed to create product "${p.name}": ${(err as Error).message}`)
    }
  }

  logger.info(`Total products created: ${createdCount}`)

  // 7. Inventory Levels
  const skus = [...stockMap.keys()]
  if (skus.length) {
    const { data: variants } = await query.graph({
      entity: 'product_variant',
      fields: ['sku', 'inventory_items.inventory_item_id'],
      filters: { sku: skus },
    })
    const { data: levels } = await query.graph({
      entity: 'inventory_level',
      fields: ['inventory_item_id'],
      filters: { location_id: locations[0].id },
    })
    const has = new Set(levels.map((l: any) => l.inventory_item_id))
    const toCreate = (variants as any[])
      .map((v) => ({ inventory_item_id: v.inventory_items?.[0]?.inventory_item_id as string | undefined, stocked_quantity: stockMap.get(v.sku) ?? 50 }))
      .filter((l) => l.inventory_item_id && !has.has(l.inventory_item_id))
      .map((l) => ({ inventory_item_id: l.inventory_item_id!, location_id: locations[0].id, stocked_quantity: l.stocked_quantity }))

    if (toCreate.length) {
      await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: toCreate } })
      logger.info(`Stock created: ${toCreate.length} inventory levels at ${locations[0].id}`)
    }
  }

  logger.info('Products seeding complete!')
}
