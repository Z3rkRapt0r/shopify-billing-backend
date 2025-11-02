# 🔗 Guida Configurazione Webhook Ordini Shopify

## 📋 URL Webhook da Configurare

**Webhook Order Creation:**
```
https://shopify-billing-backend-qbnw0vfk6-gabrieles-projects-8487f693.vercel.app/api/webhooks/orders/create
```

## ⚙️ Configurazione su Shopify

### Passo 1: Apri Shopify Admin
1. Vai su **Settings** (Impostazioni)
2. Click su **Notifications** (Notifiche)
3. Scorri fino a **Webhooks**

### Passo 2: Crea Webhook
1. Click **Create webhook**
2. Compila i campi:
   - **Event:** `Order creation`
   - **Format:** `JSON`
   - **URL:** (copia URL sopra)
   - **Webhook API version:** `2024-10` o latest

### Passo 3: Salva
1. Click **Save webhook**
2. ✅ Webhook attivo!

## 🧪 Come Testare

### Test con Ordine Reale:
1. Crea un ordine di test su Shopify (Draft → Confirm)
2. Vai su `/admin/orders` nella tua dashboard
3. Dovresti vedere l'ordine appena creato!

### Verifica Log Vercel:
```bash
vercel logs --prod --since 10m
```

**Log atteso:**
```
Order 12345678 processed successfully. Status: PENDING, Has VAT: true
✅ Order created for user mario@example.com
```

## 📊 Cosa Succede Quando Arriva un Ordine

1. **Cliente NUOVO:**
   - Crea user nel DB
   - Crea order con `invoiceStatus: PENDING`
   - Profilo fatturazione vuoto

2. **Cliente Esistente Business Italiano:**
   - Crea order con `hasVatProfile: true`
   - `invoiceStatus: PENDING`
   - Aggiunge alla coda fatture (auto-emissione)

3. **Cliente Estero (non IT):**
   - Crea order con `invoiceStatus: FOREIGN`
   - NON emette fattura automaticamente

## ⚠️ Troubleshooting

### Problema: Webhook non riceve nulla
**Soluzione:**
- Verifica che l'URL sia esatto
- Controlla che Shopify abbia salvato il webhook
- Verifica che `SHOPIFY_WEBHOOK_SECRET` sia configurato su Vercel

### Problema: Webhook riceve ma fallisce (401)
**Soluzione:**
- Verifica variabile ambiente `SHOPIFY_WEBHOOK_SECRET`
- Deve coincidere con quello di Shopify

### Problema: Ordine creato ma non in coda fatture
**Soluzione:**
- Cliente deve essere Business
- Cliente deve avere P.IVA o CF
- Cliente deve essere italiano (countryCode = IT)

## 🔐 Security

Il webhook verifica HMAC signature per sicurezza:
- Shopify firma ogni richiesta
- Il server verifica la firma
- Richieste non firmate vengono rifiutate (401)

## 📝 Variabili Ambiente Necessarie

Assicurati di avere configurato su Vercel:
- ✅ `SHOPIFY_STORE_DOMAIN`
- ✅ `SHOPIFY_ACCESS_TOKEN`
- ✅ `SHOPIFY_WEBHOOK_SECRET`
- ✅ `DATABASE_URL`
- ✅ `ADMIN_PASSWORD`

## 🚀 Deploy Finale

Dopo ogni modifica al codice webhook:
```bash
git add -A
git commit -m "Update webhook"
git push origin main
vercel --prod
```

## 📞 Support

Se il webhook non funziona:
1. Controlla log Vercel: `vercel logs --prod`
2. Testa webhook manualmente da Shopify Admin
3. Verifica che tutti i metafields cliente siano configurati
