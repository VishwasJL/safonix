import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '../../..');
const backupDir = path.join(rootDir, 'backups', 'safonix-export-20261116');
const entitiesFile = path.join(backupDir, 'entities', 'entities_00001.jsonl');
const linksFile = path.join(backupDir, 'links', 'links_00001.jsonl');

const entitiesLines = fs.readFileSync(entitiesFile, 'utf8').split('\n').filter((l) => l.trim().length > 0);
const linksLines = fs.readFileSync(linksFile, 'utf8').split('\n').filter((l) => l.trim().length > 0);

const files = new Map<number, any>();
const categories = new Map<number, any>();
const testimonials = new Map<number, any>();
const faqs = new Map<number, any>();
const legalPages = new Map<number, any>();
let siteSetting: any = null;
let homePage: any = null;
let aboutPage: any = null;
let contactPage: any = null;
let productsPage: any = null;

for (const line of entitiesLines) {
  const obj = JSON.parse(line);
  const { type, data } = obj;
  if (type === 'plugin::upload.file') {
    files.set(data.id, {
      id: data.id,
      url: data.url,
      alternativeText: data.alternativeText || data.name,
      width: data.width,
      height: data.height,
    });
  } else if (type === 'api::category.category') {
    categories.set(data.id, {
      ...data,
      children: [],
      parent: null,
      image: null,
    });
  } else if (type === 'api::testimonial.testimonial') {
    testimonials.set(data.id, {
      ...data,
      photo: null,
    });
  } else if (type === 'api::faq.faq') {
    faqs.set(data.id, data);
  } else if (type === 'api::legal-page.legal-page') {
    legalPages.set(data.id, data);
  } else if (type === 'api::site-setting.site-setting') {
    siteSetting = data;
  } else if (type === 'api::home-page.home-page') {
    homePage = data;
  } else if (type === 'api::about-page.about-page') {
    aboutPage = data;
  } else if (type === 'api::contact-page.contact-page') {
    contactPage = data;
  } else if (type === 'api::products-page.products-page') {
    productsPage = data;
  }
}

// Process relations
for (const line of linksLines) {
  const link = JSON.parse(line);
  const { left, right } = link;
  if (!left || !right) continue;

  // File attachments (morphToMany)
  if (left.type === 'plugin::upload.file' && files.has(left.ref)) {
    const file = files.get(left.ref);
    if (right.type === 'api::category.category' && categories.has(right.ref)) {
      categories.get(right.ref).image = file;
    } else if (right.type === 'api::testimonial.testimonial' && testimonials.has(right.ref)) {
      testimonials.get(right.ref).photo = file;
    } else if (right.type === 'api::home-page.home-page') {
      if (right.field === 'promoImage') homePage.promoImage = file;
      if (right.field === 'helpImage') homePage.helpImage = file;
      if (right.field === 'helpImageBack') homePage.helpImageBack = file;
    } else if (right.type === 'api::about-page.about-page') {
      if (right.field === 'image') aboutPage.image = file;
      if (right.field === 'valuesImage') aboutPage.valuesImage = file;
    } else if (right.type === 'api::contact-page.contact-page') {
      if (right.field === 'heroImage') contactPage.heroImage = file;
    } else if (right.type === 'api::products-page.products-page') {
      if (right.field === 'heroImage') productsPage.heroImage = file;
    }
  }

  // Category parent-child
  if (left.type === 'api::category.category' && right.type === 'api::category.category') {
    // left is parent or child depending on relation
    if (left.field === 'children' && categories.has(left.ref) && categories.has(right.ref)) {
      const parent = categories.get(left.ref);
      const child = categories.get(right.ref);
      if (!parent.children.find((c: any) => c.id === child.id)) {
        parent.children.push(child);
      }
      child.parent = { id: parent.id, documentId: parent.documentId, name: parent.name, slug: parent.slug };
    }
    if (left.field === 'parent' && categories.has(left.ref) && categories.has(right.ref)) {
      const child = categories.get(left.ref);
      const parent = categories.get(right.ref);
      child.parent = { id: parent.id, documentId: parent.documentId, name: parent.name, slug: parent.slug };
      if (!parent.children.find((c: any) => c.id === child.id)) {
        parent.children.push(child);
      }
    }
  }
}

const bundle = {
  siteSetting,
  homePage,
  aboutPage,
  contactPage,
  productsPage,
  categories: Array.from(categories.values()),
  testimonials: Array.from(testimonials.values()),
  faqs: Array.from(faqs.values()),
  legalPages: Array.from(legalPages.values()),
};

const outPath = path.join(rootDir, 'apps', 'web', 'src', 'data', 'strapi-bundle.json');
fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf8');
console.log('Successfully generated strapi-bundle.json at', outPath);
console.log('Categories count:', bundle.categories.length);
console.log('Testimonials count:', bundle.testimonials.length);
console.log('Faqs count:', bundle.faqs.length);
console.log('LegalPages count:', bundle.legalPages.length);
