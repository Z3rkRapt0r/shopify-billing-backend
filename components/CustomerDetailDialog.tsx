'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CustomerDetailDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  shopifyCustomerId: string;
  adminPassword: string;
}

interface CustomerDetail {
  id: string;
  shopifyCustomerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  countryCode: string | null;
  createdAt: string;
  billingProfile: {
    companyName: string | null;
    vatNumber: string | null;
    taxCode: string | null;
    pec: string | null;
    sdiCode: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    countryCode: string | null;
    isBusiness: boolean;
    source?: string; // 'shopify_realtime' o undefined (DB)
  } | null;
  billingProfileFromDb?: {
    companyName: string | null;
    vatNumber: string | null;
    taxCode: string | null;
    pec: string | null;
    sdiCode: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    countryCode: string | null;
    isBusiness: boolean;
  } | null;
  shopifyMetafields: {
    id: string;
    namespace: string;
    key: string;
    value: string;
    type: string;
  }[];
}

export function CustomerDetailDialog({
  isOpen,
  onOpenChange,
  shopifyCustomerId,
  adminPassword,
}: CustomerDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);

  useEffect(() => {
    if (isOpen && shopifyCustomerId) {
      loadCustomerDetail();
    }
  }, [isOpen, shopifyCustomerId]);

  const loadCustomerDetail = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/customers/${shopifyCustomerId}`, {
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
        },
      });

      if (!response.ok) {
        throw new Error('Errore nel caricamento dettagli cliente');
      }

      const data = await response.json();
      setCustomer(data.customer);
    } catch (err) {
      console.error('Error loading customer detail:', err);
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            👤 Dettaglio Cliente
          </DialogTitle>
          <DialogDescription>
            Informazioni complete del cliente da database e Shopify
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Caricamento dettagli...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            ❌ {error}
          </div>
        )}

        {!loading && !error && customer && (
          <div className="space-y-4">
            {/* Informazioni Base */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  📋 Informazioni Base
                  {customer.billingProfile?.isBusiness && (
                    <Badge className="bg-green-600">Business</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Nome Completo</div>
                  <div className="font-medium">
                    {customer.firstName || ''} {customer.lastName || ''}
                    {!customer.firstName && !customer.lastName && 'N/D'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Email</div>
                  <div className="font-medium">{customer.email}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Shopify Customer ID</div>
                  <div className="font-mono text-sm">{customer.shopifyCustomerId}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Paese</div>
                  <div className="font-medium">{customer.countryCode || 'N/D'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Data Creazione</div>
                  <div className="font-medium">
                    {new Date(customer.createdAt).toLocaleDateString('it-IT')}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Billing Profile (se Business) */}
            {customer.billingProfile && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>🏢 Profilo Fatturazione</span>
                    {customer.billingProfile.source === 'shopify_realtime' ? (
                      <Badge className="bg-green-600">🔄 Aggiornato in tempo reale</Badge>
                    ) : (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                        📦 Da Database
                      </Badge>
                    )}
                  </CardTitle>
                  {customer.billingProfile.source === 'shopify_realtime' && (
                    <p className="text-xs text-green-600 mt-1">
                      ✓ Dati recuperati in tempo reale dai metafields Shopify
                    </p>
                  )}
                  {!customer.billingProfile.source && (
                    <p className="text-xs text-yellow-600 mt-1">
                      ⚠️ Dati salvati nel database. Potrebbero non essere aggiornati se i metafields Shopify sono cambiati.
                    </p>
                  )}
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  {customer.billingProfile.companyName && (
                    <div className="col-span-2">
                      <div className="text-sm text-gray-500">Ragione Sociale</div>
                      <div className="font-medium">{customer.billingProfile.companyName}</div>
                    </div>
                  )}
                  {customer.billingProfile.vatNumber && (
                    <div>
                      <div className="text-sm text-gray-500">Partita IVA</div>
                      <div className="font-medium">{customer.billingProfile.vatNumber}</div>
                    </div>
                  )}
                  {customer.billingProfile.taxCode && (
                    <div>
                      <div className="text-sm text-gray-500">Codice Fiscale</div>
                      <div className="font-medium">{customer.billingProfile.taxCode}</div>
                    </div>
                  )}
                  {customer.billingProfile.sdiCode && (
                    <div>
                      <div className="text-sm text-gray-500">Codice SDI</div>
                      <div className="font-medium">{customer.billingProfile.sdiCode}</div>
                    </div>
                  )}
                  {customer.billingProfile.pec && (
                    <div>
                      <div className="text-sm text-gray-500">PEC</div>
                      <div className="font-medium">{customer.billingProfile.pec}</div>
                    </div>
                  )}
                  {customer.billingProfile.addressLine1 && (
                    <div className="col-span-2">
                      <div className="text-sm text-gray-500">Indirizzo</div>
                      <div className="font-medium">
                        {customer.billingProfile.addressLine1}
                        {customer.billingProfile.addressLine2 && `, ${customer.billingProfile.addressLine2}`}
                      </div>
                    </div>
                  )}
                  {customer.billingProfile.city && (
                    <div>
                      <div className="text-sm text-gray-500">Città</div>
                      <div className="font-medium">
                        {customer.billingProfile.city}
                        {customer.billingProfile.province && ` (${customer.billingProfile.province})`}
                      </div>
                    </div>
                  )}
                  {customer.billingProfile.postalCode && (
                    <div>
                      <div className="text-sm text-gray-500">CAP</div>
                      <div className="font-medium">{customer.billingProfile.postalCode}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Shopify Metafields */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  🏷️ Metafields Shopify
                  <Badge variant="outline">{customer.shopifyMetafields.length} totali</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {customer.shopifyMetafields.length === 0 ? (
                  <div className="text-center py-6 text-gray-400">
                    Nessun metafield trovato per questo cliente
                  </div>
                ) : (
                  <div className="space-y-3">
                    {customer.shopifyMetafields.map((metafield) => (
                      <div
                        key={metafield.id}
                        className="border rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono bg-blue-100 text-blue-700 px-2 py-1 rounded">
                              {metafield.namespace}
                            </span>
                            <span className="font-medium text-sm">{metafield.key}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {metafield.type}
                          </Badge>
                        </div>
                        <div className="bg-white border rounded p-2 mt-2">
                          <div className="text-sm font-mono break-all">
                            {metafield.value}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

