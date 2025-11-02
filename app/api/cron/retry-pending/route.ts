import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createOpenAPIClient, buildInvoiceData } from '@/lib/openapiSdi';

export async function GET(request: NextRequest) {
  try {
    // Verifica che sia una chiamata cron (semplice verifica per Vercel)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const openAPIClient = createOpenAPIClient();
    const maxRetries = 3;
    const batchSize = 10; // Processa max 10 job per esecuzione

    // Trova job PENDING in coda
    const pendingJobs = await prisma.queueJob.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: maxRetries },
        scheduledAt: { lte: new Date() },
      },
      take: batchSize,
      orderBy: { scheduledAt: 'asc' },
    });

    if (pendingJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending jobs to process',
        processed: 0,
      });
    }

    let processedCount = 0;
    let errorCount = 0;

    for (const job of pendingJobs) {
      try {
        // Aggiorna lo stato del job a PROCESSING
        await prisma.queueJob.update({
          where: { id: job.id },
          data: {
            status: 'PROCESSING',
            attempts: { increment: 1 },
          },
        });

        let success = false;
        let errorMessage = '';

        if (job.type === 'invoice') {
          const { shopifyOrderId } = job.payload as { shopifyOrderId: string };

          // Trova l'ordine
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
            errorMessage = 'Order not found';
          } else if (order.invoiceStatus === 'ISSUED') {
            // Già processato, marca come completato
            success = true;
          } else if (order.invoiceStatus === 'FOREIGN' || 
                     (order.user.countryCode && order.user.countryCode !== 'IT')) {
            // Cliente estero, aggiorna stato
            await prisma.orderSnapshot.update({
              where: { id: order.id },
              data: {
                invoiceStatus: 'FOREIGN',
                lastError: null,
              },
            });
            success = true;
          } else if (!order.hasVatProfile || !order.user.billingProfile) {
            errorMessage = 'Customer missing valid billing profile';
          } else {
            // Prova a emettere la fattura
            const invoiceData = await buildInvoiceData(shopifyOrderId);
            if (invoiceData) {
              const invoiceResult = await openAPIClient.issueInvoice(invoiceData);
              
              await prisma.orderSnapshot.update({
                where: { id: order.id },
                data: {
                  invoiceStatus: 'ISSUED',
                  invoiceId: invoiceResult.id,
                  invoiceDate: new Date(invoiceResult.date),
                  lastError: null,
                },
              });
              
              success = true;
              console.log(`Invoice issued for order ${shopifyOrderId}: ${invoiceResult.id}`);
            } else {
              errorMessage = 'Failed to build invoice data';
            }
          }
        } else {
          errorMessage = `Unknown job type: ${job.type}`;
        }

        // Aggiorna lo stato finale del job
        if (success) {
          await prisma.queueJob.update({
            where: { id: job.id },
            data: {
              status: 'COMPLETED',
              processedAt: new Date(),
              lastError: null,
            },
          });
          processedCount++;
        } else {
          const isFinalFailure = job.attempts >= maxRetries - 1;
          
          await prisma.queueJob.update({
            where: { id: job.id },
            data: {
              status: isFinalFailure ? 'FAILED' : 'PENDING',
              lastError: errorMessage,
              scheduledAt: isFinalFailure ? undefined : new Date(Date.now() + 5 * 60 * 1000), // Retry in 5 minuti
            },
          });

          // Se è un fallimento finale per una fattura, aggiorna lo stato dell'ordine
          if (isFinalFailure && job.type === 'invoice') {
            const { shopifyOrderId } = job.payload as { shopifyOrderId: string };
            await prisma.orderSnapshot.updateMany({
              where: { shopifyOrderId },
              data: {
                invoiceStatus: 'ERROR',
                lastError: errorMessage,
              },
            });
          }

          errorCount++;
        }

      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        
        const isFinalFailure = job.attempts >= maxRetries - 1;
        
        await prisma.queueJob.update({
          where: { id: job.id },
          data: {
            status: isFinalFailure ? 'FAILED' : 'PENDING',
            lastError: error instanceof Error ? error.message : 'Unknown error',
            scheduledAt: isFinalFailure ? undefined : new Date(Date.now() + 5 * 60 * 1000),
          },
        });

        errorCount++;
      }
    }

    // Pulisci job vecchi completati/failed (più di 7 giorni)
    const cleanupDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await prisma.queueJob.deleteMany({
      where: {
        status: { in: ['COMPLETED', 'FAILED'] },
        processedAt: { lt: cleanupDate },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Processed ${pendingJobs.length} jobs`,
      processed: processedCount,
      errors: errorCount,
    });

  } catch (error) {
    console.error('Error in retry cron job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Manuale trigger per retry (per testing)
export async function POST(request: NextRequest) {
  try {
    // Verifica autenticazione admin
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { jobId, shopifyOrderId } = body;

    if (jobId) {
      // Retry job specifico
      await prisma.queueJob.update({
        where: { id: jobId },
        data: {
          status: 'PENDING',
          attempts: 0,
          lastError: null,
          scheduledAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Job ${jobId} queued for retry`,
      });
    } else if (shopifyOrderId) {
      // Retry tutti i job per un ordine specifico
      const updatedJobs = await prisma.queueJob.updateMany({
        where: {
          type: 'invoice',
          payload: {
            path: [],
            string_contains: shopifyOrderId,
          },
        },
        data: {
          status: 'PENDING',
          attempts: 0,
          lastError: null,
          scheduledAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `${updatedJobs.count} jobs queued for retry`,
      });
    } else {
      return NextResponse.json(
        { error: 'jobId or shopifyOrderId required' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error in manual retry:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}