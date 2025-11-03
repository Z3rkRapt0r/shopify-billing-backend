import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyShopifyWebhook } from '@/lib/shopify';
import { z } from 'zod';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Schema per Order updated webhook di Shopify
const shopifyOrderUpdatedSchema = z.object({
  id: z.number().transform(String),
  order_number: z.number().transform(String),
  cancelled_at: z.string().nullable().optional(),
  financial_status: z.string().nullable().optional(),
  cancelled_reason: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const shopifyHmac = request.headers.get('x-shopify-hmac-sha256');

    // Verifica HMAC
    if (!shopifyHmac || !verifyShopifyWebhook(body, shopifyHmac)) {
      console.error('Webhook HMAC verification failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse webhook data
    const parsedBody = JSON.parse(body);
    const webhookData = shopifyOrderUpdatedSchema.parse(parsedBody);
    
    console.log(`🔄 Webhook Order Updated ricevuto: ${webhookData.id}`);

    // Trova l'ordine nel nostro database
    const order = await prisma.orderSnapshot.findUnique({
      where: {
        shopifyOrderId: webhookData.id,
      },
      include: {
        user: {
          include: {
            billingProfile: true,
          },
        },
      },
    });

    if (!order) {
      console.warn(`Ordine non trovato per Shopify Order ID: ${webhookData.id}`);
      return NextResponse.json({ success: true, message: 'Order not found' });
    }

    // Verifica se l'ordine è stato cancellato
    const isCancelled = !!webhookData.cancelled_at;

    if (!isCancelled) {
      console.log(`ℹ️  Ordine ${webhookData.id} aggiornato ma non cancellato`);
      return NextResponse.json({ success: true, message: 'Order updated but not cancelled' });
    }

    console.log(`🚫 Ordine ${webhookData.id} CANCELLATO su Shopify`);
    console.log(`   Motivo: ${webhookData.cancelled_reason || 'N/A'}`);

    // APPLICA LOGICA BUSINESS RULES
    const currentStatus = order.invoiceStatus as string;

    // Caso 1: Corrispettivo o Estero → Solo annullamento
    if (currentStatus === 'CORRISPETTIVO' || currentStatus === 'FOREIGN') {
      console.log(`📋 Ordine ${webhookData.id} è ${currentStatus} → Solo annullamento`);
      
      await prisma.orderSnapshot.update({
        where: {
          shopifyOrderId: webhookData.id,
        },
        data: {
          invoiceStatus: 'CANCELLED',
          lastError: `Ordine annullato: ${webhookData.cancelled_reason || 'N/A'}`,
        },
      });

      console.log(`✅ Ordine ${webhookData.id} marcato come CANCELLED`);
      return NextResponse.json({ success: true, action: 'cancelled' });
    }

    // Caso 2 e 3: Business (PENDING, ISSUED, ERROR)
    if (currentStatus === 'PENDING' || currentStatus === 'ISSUED' || currentStatus === 'ERROR') {
      // Caso 2a: Fattura già emessa (ISSUED) → Nota di credito
      if (currentStatus === 'ISSUED') {
        console.log(`📧 Ordine ${webhookData.id} ha fattura emessa (ISSUED) → Creo nota di credito`);
        
        // Verifica se nota di credito esiste già
        const existingCreditNote = await prisma.creditNote.findFirst({
          where: {
            orderId: order.id,
          },
        });

        if (existingCreditNote) {
          console.log(`⚠️  Nota di credito già esistente per ordine ${webhookData.id}`);
          await prisma.orderSnapshot.update({
            where: {
              shopifyOrderId: webhookData.id,
            },
            data: {
              invoiceStatus: 'CANCELLED',
              lastError: `Ordine annullato con nota di credito esistente: ${webhookData.cancelled_reason || 'N/A'}`,
            },
          });
        } else {
          // Crea nota di credito
          await prisma.creditNote.create({
            data: {
              orderId: order.id,
              reason: webhookData.cancelled_reason || 'Ordine annullato',
              totalAmount: order.totalPrice || 0,
              status: 'PENDING',
            },
          });

          // Marca ordine come CANCELLED
          await prisma.orderSnapshot.update({
            where: {
              shopifyOrderId: webhookData.id,
            },
            data: {
              invoiceStatus: 'CANCELLED',
              lastError: `Ordine annullato - Nota di credito creata: ${webhookData.cancelled_reason || 'N/A'}`,
            },
          });

          console.log(`✅ Nota di credito creata per ordine ${webhookData.id}`);
        }

        return NextResponse.json({ success: true, action: 'credit_note_created' });
      }

      // Caso 2b: Fattura NON emessa (PENDING o ERROR) → Solo annullamento
      console.log(`📋 Ordine ${webhookData.id} è ${currentStatus} (NO fattura emessa) → Solo annullamento`);
      
      await prisma.orderSnapshot.update({
        where: {
          shopifyOrderId: webhookData.id,
        },
        data: {
          invoiceStatus: 'CANCELLED',
          lastError: `Ordine annullato: ${webhookData.cancelled_reason || 'N/A'}`,
        },
      });

      console.log(`✅ Ordine ${webhookData.id} marcato come CANCELLED`);
      return NextResponse.json({ success: true, action: 'cancelled' });
    }

    // Caso 3: Ordine già cancellato → Nessuna azione
    if (currentStatus === 'CANCELLED') {
      console.log(`⚠️  Ordine ${webhookData.id} già marcato come CANCELLED`);
      return NextResponse.json({ success: true, action: 'already_cancelled' });
    }

    // Stato sconosciuto
    console.error(`❓ Stato ordine sconosciuto: ${currentStatus} per ordine ${webhookData.id}`);
    return NextResponse.json({ success: true, message: 'Unknown order status' });

  } catch (error) {
    console.error('Error processing order updated webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

