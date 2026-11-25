# Safonix - Terminal Run Guide & Steps

This guide provides the exact terminal commands and steps to start both the **Medusa Backend** and the **Next.js Storefront**.

---

## 📌 Prerequisites
1. **Node.js**: `v20.19.0` or `>=22.12.0` (Node 24 is supported).
2. **PostgreSQL**: Must be running on port `5432` with database `safonix_commerce`.

---

## 🚀 How to Run the Application

You will need **two terminal windows** (both opened at the project root folder).

### Root Working Directory:
```powershell
cd c:\Users\vishw\OneDrive\Desktop\safonix
```

---

### Terminal 1: Start Backend (Medusa v2)

1. Open your first terminal and run:
```powershell
cd c:\Users\vishw\OneDrive\Desktop\safonix
npm --prefix apps/backend run start
```
*(Or navigate directly to `cd apps/backend` and run `npm run start`)*

2. **Wait until you see:**
```text
√ Server is ready on port: 9000
```

3. **Backend URLs:**
- **Store API / Health**: [http://localhost:9000/health](http://localhost:9000/health)
- **Medusa Admin Dashboard**: [http://localhost:9000/app](http://localhost:9000/app)
- **Admin Credentials:**
  - **Email:** `admin@safonix.com`
  - **Password:** `admin12345`

---

### Terminal 2: Start Storefront (Next.js)

1. Open your second terminal and run:
```powershell
cd c:\Users\vishw\OneDrive\Desktop\safonix
npm --prefix apps/web run dev
```
*(Or navigate directly to `cd apps/web` and run `npm run dev`)*

2. **Wait until you see:**
```text
▲ Next.js 16.4.6 (Turbopack)
- Local: http://localhost:3000
✓ Ready
```

3. **Storefront URLs:**
- **Storefront Homepage**: [http://localhost:3000](http://localhost:3000)
- **All Products**: [http://localhost:3000/products](http://localhost:3000/products)
- **Product Details**: [http://localhost:3000/product/safonix-9w-led-bulb](http://localhost:3000/product/safonix-9w-led-bulb)
- **Category**: [http://localhost:3000/products/modular-switches](http://localhost:3000/products/modular-switches)
- **Shopping Cart**: [http://localhost:3000/cart](http://localhost:3000/cart)
- **Checkout**: [http://localhost:3000/checkout](http://localhost:3000/checkout)

---

## 🛠️ Helpful Maintenance Commands (If Needed in Future)

Run from `c:\Users\vishw\OneDrive\Desktop\safonix`:

| Action | Command |
| :--- | :--- |
| **Run Database Migrations** | `npm --prefix apps/backend run migrate` |
| **Seed Store Foundations** (Region, Currency, Warehouse, Coupons) | `npm --prefix apps/backend run seed` |
| **Seed Safonix Electrical Catalog** (28 categories, 32 products, stock) | `npm --prefix apps/backend run seed:products` |
| **Re-build Backend & Admin Dashboard** | `npm --prefix apps/backend run build` |
| **Create New Admin User** | `npx --prefix apps/backend medusa user -e newadmin@safonix.com -p yourpassword` |

---

## 🔑 Available Promotion / Coupon Codes
You can test these in the cart checkout:
- `WELCOME5` — 5% discount
- `SAFONIX10` — 10% discount
