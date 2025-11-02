import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Inizio seeding del database...');

  // Creazione utenti di test
  const user1 = await prisma.user.upsert({
    where: { shopifyCustomerId: 'shopify_123456' },
    update: {},
    create: {
      shopifyCustomerId: 'shopify_123456',
      email: 'mario.rossi@example.com',
      firstName: 'Mario',
      lastName: 'Rossi',
      countryCode: 'IT',
      billingProfile: {
        create: {
          companyName: 'Mario Rossi SRL',
          vatNumber: 'IT01234567890',
          taxCode: 'RSSMRA80A01H501U',
          pec: 'mario.rossi@pec.it',
          sdiCode: '0000000',
          addressLine1: 'Via Roma 1',
          city: 'Milano',
          province: 'MI',
          postalCode: '20121',
          countryCode: 'IT',
          isBusiness: true,
        },
      },
    },
    include: {
      billingProfile: true,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { shopifyCustomerId: 'shopify_789012' },
    update: {},
    create: {
      shopifyCustomerId: 'shopify_789012',
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
      countryCode: 'US',
      billingProfile: {
        create: {
          addressLine1: '123 Main St',
          city: 'New York',
          postalCode: '10001',
          countryCode: 'US',
          isBusiness: false,
        },
      },
    },
    include: {
      billingProfile: true,
    },
  });

  // Creazione ordini di test
  await prisma.orderSnapshot.upsert({
    where: { shopifyOrderId: 'shopify_order_1' },
    update: {},
    create: {
      userId: user1.id,
      shopifyOrderId: 'shopify_order_1',
      orderNumber: '#1001',
      currency: 'EUR',
      totalPrice: 150.50,
      shopifyCreatedAt: new Date('2024-01-15T10:00:00Z'),
      hasVatProfile: true,
      invoiceStatus: 'ISSUED',
      invoiceId: 'INV-2024-001',
      invoiceDate: new Date('2024-01-15T10:30:00Z'),
    },
  });

  await prisma.orderSnapshot.upsert({
    where: { shopifyOrderId: 'shopify_order_2' },
    update: {},
    create: {
      userId: user2.id,
      shopifyOrderId: 'shopify_order_2',
      orderNumber: '#1002',
      currency: 'USD',
      totalPrice: 89.99,
      shopifyCreatedAt: new Date('2024-01-16T14:00:00Z'),
      hasVatProfile: false,
      invoiceStatus: 'FOREIGN',
    },
  });

  await prisma.orderSnapshot.upsert({
    where: { shopifyOrderId: 'shopify_order_3' },
    update: {},
    create: {
      userId: user1.id,
      shopifyOrderId: 'shopify_order_3',
      orderNumber: '#1003',
      currency: 'EUR',
      totalPrice: 250.00,
      shopifyCreatedAt: new Date('2024-01-17T09:00:00Z'),
      hasVatProfile: true,
      invoiceStatus: 'PENDING',
    },
  });

  // Creazione note di credito di test
  await prisma.creditNote.create({
    data: {
      orderId: 'shopify_order_1',
      reason: 'Reso merce',
      totalAmount: 50.00,
      sdiCreditId: 'CRED-2024-001',
      status: 'ISSUED',
    },
  });

  // Creazione job in coda di test
  await prisma.queueJob.create({
    data: {
      type: 'invoice',
      payload: {
        shopifyOrderId: 'shopify_order_3',
      },
      status: 'PENDING',
      scheduledAt: new Date(),
    },
  });

  console.log('Seeding completato!');
  console.log(`Utenti creati: ${await prisma.user.count()}`);
  console.log(`Ordini creati: ${await prisma.orderSnapshot.count()}`);
  console.log(`Note di credito create: ${await prisma.creditNote.count()}`);
  console.log(`Job in coda creati: ${await prisma.queueJob.count()}`);
}

main()
  .catch((e) => {
    console.error('Errore durante il seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });