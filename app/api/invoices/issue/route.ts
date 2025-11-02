import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createOpenAPIClient, buildInvoiceData } from '@/lib/openapiSdi';
import { issueInvoiceSchema } from '@/lib/validators';

// Force dynamic rendering (usa headers per auth)
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Verifica autenticazione admin
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { shopifyOrderId } = issueInvoiceSchema.parse(body);

    // Trova l'ordine nel database
    const order = await prisma.orderSnapshot.findUnique({
      where: { shopifyOrderId },
      include: {
        user: {
          include: {
            billingProfile: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Verifica se l'ordine è già stato processato
    if (order.invoiceStatus === 'ISSUED') {
      return NextResponse.json({ error: 'Invoice already issued' }, { status: 400 });
    }

    // Se è un cliente estero, aggiorna lo stato e non emettere fattura
    if (order.invoiceStatus === 'FOREIGN' || 
        (order.user.countryCode && order.user.countryCode !== 'IT')) {
      await prisma.orderSnapshot.update({
        where: { id: order.id },
        data: {
          invoiceStatus: 'FOREIGN',
          lastError: null,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Foreign customer - invoice not required',
        invoiceStatus: 'FOREIGN',
      });
    }

    // Verifica che il cliente abbia un profilo fatturazione valido
    if (!order.hasVatProfile || !order.user.billingProfile) {
      await prisma.orderSnapshot.update({
        where: { id: order.id },
        data: {
          invoiceStatus: 'ERROR',
          lastError: 'Customer missing valid billing profile',
        },
      });

      return NextResponse.json({ error: 'Customer missing valid billing profile' }, { status: 400 });
    }

    // Costruisci i dati per la fattura
    const invoiceData = await buildInvoiceData(shopifyOrderId);
    if (!invoiceData) {
      await prisma.orderSnapshot.update({
        where: { id: order.id },
        data: {
          invoiceStatus: 'ERROR',
          lastError: 'Failed to build invoice data',
        },
      });

      return NextResponse.json({ error: 'Failed to build invoice data' }, { status: 500 });
    }

    // Emetti la fattura tramite OpenAPI SDI
    const openAPIClient = createOpenAPIClient();
    const invoiceResult = await openAPIClient.issueInvoice(invoiceData);

    // Aggiorna l'ordine con il risultato
    await prisma.orderSnapshot.update({
      where: { id: order.id },
      data: {
        invoiceStatus: 'ISSUED',
        invoiceId: invoiceResult.id,
        invoiceDate: new Date(invoiceResult.date),
        lastError: null,
      },
    });

    console.log(`Invoice issued for order ${shopifyOrderId}: ${invoiceResult.id}`);
    return NextResponse.json({
      success: true,
      invoiceId: invoiceResult.id,
      invoiceDate: invoiceResult.date,
      invoiceStatus: 'ISSUED',
    });

  } catch (error) {
    console.error('Error issuing invoice:', error);
    
    // Se abbiamo l'ID dell'ordine, aggiorna lo stato a ERROR
    try {
      const body = await request.clone().json();
      const { shopifyOrderId } = issueInvoiceSchema.parse(body);
      
      await prisma.orderSnapshot.updateMany({
        where: { shopifyOrderId },
        data: {
          invoiceStatus: 'ERROR',
          lastError: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    } catch (updateError) {
      console.error('Failed to update order error status:', updateError);
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Ottieni dettagli fattura
export async function GET(request: NextRequest) {
  try {
    // Verifica autenticazione admin
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const shopifyOrderId = searchParams.get('shopifyOrderId');

    if (!shopifyOrderId) {
      return NextResponse.json({ error: 'shopifyOrderId required' }, { status: 400 });
    }

    const order = await prisma.orderSnapshot.findUnique({
      where: { shopifyOrderId },
      include: {
        user: {
          include: {
            billingProfile: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Se la fattura è stata emessa, costruisci i dati completi
    let invoiceData = null;
    if (order.invoiceStatus === 'ISSUED') {
      invoiceData = await buildInvoiceData(shopifyOrderId);
    }

    return NextResponse.json({
      order,
      invoiceData,
    });

  } catch (error) {
    console.error('Error fetching invoice details:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}