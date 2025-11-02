# Shopify Billing Backend

Backend esterno per fatturazione Shopify con integrazione SDI (Sistema di Interscambio) per l'emissione di fatture elettroniche italiane.

## Caratteristiche

- ✅ Sincronizzazione automatica clienti da Shopify via webhooks
- ✅ Gestione profili di fatturazione esterni a Shopify
- ✅ Emissione fatture elettroniche tramite OpenAPI SDI
- ✅ Supporto per clienti italiani (con P.IVA) ed esteri
- ✅ Dashboard admin per gestione ordini e clienti
- ✅ Sistema di retry automatico per fatture fallite
- ✅ Note di credito per resi e storni
- ✅ Form embeddabile nel storefront Shopify via App Proxy

## Stack Tecnologico

- **Frontend**: Next.js 14 con App Router, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (Neon/Vercel Postgres)
- **Autenticazione**: Shopify Customer Account API
- **Fatturazione**: OpenAPI SDI
- **Deploy**: Vercel con Cron Jobs

## Prerequisiti

- Node.js 18+ 
- Account Shopify con accesso Admin API
- Account OpenAPI SDI per fatturazione elettronica
- Database PostgreSQL (Neon consigliato per Vercel)

## Setup Rapido

### 1. Clona e Installa

```bash
git clone <repository-url>
cd shopify-billing-backend
npm install
```

### 2. Configura Variabili d'Ambiente

Copia `.env.example` in `.env` e configura:

```bash
# Shopify Configuration
SHOPIFY_SHOP=nome-store.myshopify.com
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_SCOPES=read_customers,write_customers,read_orders,write_orders
SHOPIFY_APP_URL=https://your-app.vercel.app
SHOPIFY_APP_PROXY_SUBPATH=billing
SHOPIFY_APP_PROXY_PREFIX=/apps

# Database
DATABASE_URL=postgres://username:password@host:port/database

# OpenAPI SDI
OPENAPI_SDI_BASE_URL=https://api.openapi.it/sdi
OPENAPI_SDI_TOKEN=your_openapi_token
SUPPLIER_VAT_NUMBER=IT01234567890
SUPPLIER_TAX_CODE=RSSMRA80A01H501U

# Sicurezza
SESSION_SECRET=super-long-random-string-here
ADMIN_PASSWORD=your_admin_password
CRON_SECRET=your_cron_secret
```

### 3. Setup Database

```bash
# Genera client Prisma
npx prisma generate

# Esegui migrazioni
npx prisma db push

# Popola dati di test (opzionale)
npx prisma db seed
```

### 4. Avvio Sviluppo

```bash
npm run dev
```

L'app sarà disponibile su `http://localhost:3000`

## Configurazione Shopify

### 1. Webhooks

Configura questi webhook nel tuo store Shopify:

```
https://your-app.vercel.app/api/webhooks/customers/create
https://your-app.vercel.app/api/webhooks/customers/update  
https://your-app.vercel.app/api/webhooks/orders/create
```

Eventi richiesti:
- `customers/create`
- `customers/update`
- `orders/create`

### 2. App Proxy (opzionale)

Per embeddare il form di fatturazione nel tuo storefront:

1. Vai su Shopify Admin → Apps → App Proxy
2. Aggiungi nuovo proxy:
   - **Subpath**: `billing`
   - **Subfolder**: `apps`
   - **URL**: `https://your-app.vercel.app`
3. Il form sarà accessibile a: `https://tuostore.myshopify.com/apps/billing/profile`

## Struttura del Progetto

```
├── app/                    # Next.js App Router
│   ├── admin/             # Dashboard admin
│   ├── portal/             # Portale clienti
│   └── api/               # API Routes
│       ├── admin/           # API admin
│       ├── webhooks/        # Webhook handlers
│       ├── profile/         # Profilo cliente
│       ├── invoices/        # Gestione fatture
│       ├── credit-notes/    # Note di credito
│       └── cron/           # Cron jobs
├── components/             # Componenti React
│   └── ui/              # Componenti UI base
├── lib/                   # Utilità e configurazione
│   ├── prisma.ts         # Client database
│   ├── shopify.ts        # Integrazione Shopify
│   ├── openapiSdi.ts    # Client SDI
│   └── validators.ts     # Validazioni Zod
├── prisma/                # Schema e seed database
└── public/                # Asset statici
```

## API Endpoints

### Admin

- `GET/POST /api/admin/sync-customers` - Sincronizza clienti Shopify
- `GET/POST /api/admin/mark-business` - Gestisci stato business clienti
- `GET/POST /api/admin/orders` - Report ordini con filtri

### Profilo Cliente

- `GET /api/profile/me` - Ottieni profilo fatturazione
- `POST /api/profile/me` - Aggiorna profilo fatturazione

### Fatturazione

- `POST /api/invoices/issue` - Emetti fattura elettronica
- `GET /api/invoices/issue` - Dettagli fattura

### Note di Credito

- `POST /api/credit-notes/issue` - Emetti nota di credito
- `GET /api/credit-notes/issue` - Lista note di credito

### Webhooks

- `POST /api/webhooks/customers/create` - Nuovo cliente
- `POST /api/webhooks/customers/update` - Aggiornamento cliente
- `POST /api/webhooks/orders/create` - Nuovo ordine

### Cron Jobs

- `GET /api/cron/retry-pending` - Retry automatico fatture fallite

## Flusso di Fatturazione

1. **Cliente crea account** → Webhook `customers/create`
2. **Cliente compila profilo** → Form `/portal/profile`
3. **Cliente effettua ordine** → Webhook `orders/create`
4. **Sistema determina stato**:
   - Cliente IT con P.IVA → `PENDING` (accodato per emissione)
   - Cliente estero → `FOREIGN` (nessuna fattura SDI)
   - Dati incompleti → `ERROR` (attesa correzione)
5. **Cron job processa** → Emissione fattura via OpenAPI SDI
6. **Stato finale** → `ISSUED` o `ERROR`

## Dashboard Admin

Accedi a `/admin` con password configurata in `ADMIN_PASSWORD`.

### KPI Disponibili

- Clienti totali e aziendali
- Ordini totali e per stato
- Fatture emesse e in errore
- Statistiche per periodo

### Funzionalità

- Sincronizzazione manuale clienti
- Emissione manuale fatture
- Gestione note di credito
- Filtri e ricerche avanzate
- Export dati

## Deploy su Vercel

### 1. Prepara Repository

```bash
git add .
git commit -m "Setup progetto billing backend"
git push origin main
```

### 2. Deploy su Vercel

1. Connetti il tuo repository GitHub a Vercel
2. Configura le variabili d'ambiente nel dashboard Vercel
3. Deploy automatico al push su main

### 3. Post-Deploy

1. Aggiorna URL webhooks in Shopify Admin
2. Configura App Proxy se necessario
3. Testa integrazione completa

## Monitoraggio e Logging

- Logs Vercel: Dashboard Vercel → Functions
- Database: Prisma Studio o query dirette
- Errori SDI: Dashboard OpenAPI
- Webhook: Logs API routes

## Sicurezza

- HMAC verification per tutti i webhook Shopify
- Admin authentication via password
- Token-based authentication per clienti
- Input validation con Zod
- SQL injection protection via Prisma ORM

## Troubleshooting

### Webhook non funzionano
- Verifica URL e HMAC secret
- Controlla Shopify Admin → Webhooks
- Controlla logs Vercel

### Fatture non emesse
- Verifica configurazione OpenAPI SDI
- Controlla profilo cliente (P.IVA, paese)
- Verifica coda job `/api/cron/retry-pending`

### Errori database
- Esegui `npx prisma db push`
- Verifica `DATABASE_URL`
- Controlla schema in Prisma Studio

## Supporto

Per problemi o domande:

1. Controlla logs Vercel
2. Verifica configurazione variabili ambiente
3. Testa API endpoints con curl/Postman
4. Apri issue su GitHub

## Licenza

MIT License - vedi file LICENSE per dettagli.