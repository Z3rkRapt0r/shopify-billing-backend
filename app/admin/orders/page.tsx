'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';

interface Order {
  id: string;
  shopifyOrderId: string;
  orderNumber: string;
  currency: string;
  totalPrice: number;
  createdAt: string;
  hasVatProfile: boolean;
  invoiceStatus: 'PENDING' | 'ISSUED' | 'ERROR' | 'FOREIGN' | 'CORRISPETTIVO';
  invoiceId?: string;
  invoiceDate?: string;
  lastError?: string;
  user: {
    email: string;
    firstName?: string;
    lastName?: string;
    billingProfile?: {
      companyName?: string;
      vatNumber?: string;
      isBusiness: boolean;
    };
  };
}

export default function OrdersPage() {
  const [adminPassword, setAdminPassword] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [issuingInvoice, setIssuingInvoice] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Recupera password da sessionStorage
  useEffect(() => {
    const savedPassword = sessionStorage.getItem('adminPassword');
    if (savedPassword) {
      setAdminPassword(savedPassword);
    } else {
      window.location.href = '/admin';
    }
  }, []);

  // Carica ordini solo se autenticato
  useEffect(() => {
    if (adminPassword) {
      loadOrders();
    }
  }, [page, search, statusFilter, fromDate, toDate, adminPassword]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      
      if (search) {
        params.append('search', search);
      }
      
      if (statusFilter !== null) {
        params.append('status', statusFilter);
      }
      
      if (fromDate) {
        params.append('from', fromDate);
      }
      
      if (toDate) {
        params.append('to', toDate);
      }

      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
        },
      });

      if (!response.ok) {
        throw new Error('Errore nel caricamento ordini');
      }

      const data = await response.json();
      setOrders(data.orders || []);
      setTotalPages(data.pagination?.pages || 1);
    } catch (err) {
      console.error('Error loading orders:', err);
      setError('Errore nel caricamento ordini');
    } finally {
      setLoading(false);
    }
  };

  const handleIssueInvoice = async (shopifyOrderId: string) => {
    setIssuingInvoice(shopifyOrderId);
    try {
      const response = await fetch('/api/invoices/issue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shopifyOrderId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore durante emissione fattura');
      }

      const data = await response.json();
      alert(`Fattura emessa: ${data.invoiceId}`);
      
      // Ricarica la lista ordini
      loadOrders();
    } catch (err) {
      console.error('Error issuing invoice:', err);
      alert(err instanceof Error ? err.message : 'Errore durante emissione fattura');
    } finally {
      setIssuingInvoice(null);
    }
  };

  const handleRetryInvoices = async () => {
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'retry_invoices',
          orderIds: selectedOrders,
        }),
      });

      if (!response.ok) {
        throw new Error('Errore durante retry fatture');
      }

      const data = await response.json();
      alert(`Retry avviato per ${data.result.updatedCount} fatture`);
      
      // Ricarica la lista ordini
      loadOrders();
      setSelectedOrders([]);
    } catch (err) {
      console.error('Error retrying invoices:', err);
      alert('Errore durante retry fatture');
    }
  };

  const handleResetErrors = async () => {
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reset_errors',
          orderIds: selectedOrders,
        }),
      });

      if (!response.ok) {
        throw new Error('Errore durante reset errori');
      }

      const data = await response.json();
      alert(`Reset errori completato per ${data.result.updatedCount} ordini`);
      
      // Ricarica la lista ordini
      loadOrders();
      setSelectedOrders([]);
    } catch (err) {
      console.error('Error resetting errors:', err);
      alert('Errore durante reset errori');
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1); // Resetta alla prima pagina
  };

  const handleFilter = (filter: string | null) => {
    setStatusFilter(filter === statusFilter ? null : filter);
    setPage(1); // Resetta alla prima pagina
  };

  const handleDateFilter = () => {
    setPage(1); // Resetta alla prima pagina
  };

  const handleSelectOrder = (shopifyOrderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(shopifyOrderId) 
        ? prev.filter(id => id !== shopifyOrderId)
        : [...prev, shopifyOrderId]
    );
  };

  const handleSelectAll = () => {
    setSelectedOrders(orders.map(order => order.shopifyOrderId));
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case 'ISSUED':
        return <Badge variant="success">Emessa</Badge>;
      case 'PENDING':
        return <Badge variant="warning">In Attesa</Badge>;
      case 'ERROR':
        return <Badge variant="destructive">Errore</Badge>;
      case 'FOREIGN':
        return <Badge variant="info">Estero</Badge>;
      case 'CORRISPETTIVO':
        return <Badge className="bg-gray-600">Corrispettivo</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Gestione Ordini
          </h1>
          <p className="mt-2 text-gray-600">
            Visualizza e gestisci gli ordini con stato fatturazione
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Azioni Rapide</CardTitle>
            <CardDescription>
              Operazioni di gestione ordini
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button 
                onClick={() => window.location.href = '/admin/customers'}
                variant="outline"
              >
                Gestione Clienti
              </Button>
              <Button 
                onClick={() => window.location.href = '/admin/credit-notes'}
                variant="outline"
              >
                Note di Credito
              </Button>
              <Button 
                onClick={() => window.location.href = '/admin/sync-customers'}
                variant="outline"
              >
                Sincronizza Clienti
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filtri</CardTitle>
            <CardDescription>
              Filtra ordini per stato, periodo o ricerca
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <Input
                placeholder="Cerca per numero ordine..."
                value={search}
                onChange={handleSearch}
                className="max-w-md"
              />
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === 'PENDING' ? 'default' : 'outline'}
                  onClick={() => handleFilter('PENDING')}
                >
                  In Attesa
                </Button>
                <Button
                  variant={statusFilter === 'ISSUED' ? 'default' : 'outline'}
                  onClick={() => handleFilter('ISSUED')}
                >
                  Emesse
                </Button>
                <Button
                  variant={statusFilter === 'ERROR' ? 'default' : 'outline'}
                  onClick={() => handleFilter('ERROR')}
                >
                  Errori
                </Button>
                <Button
                  variant={statusFilter === 'FOREIGN' ? 'default' : 'outline'}
                  onClick={() => handleFilter('FOREIGN')}
                >
                  Esteri
                </Button>
                <Button
                  variant={statusFilter === 'CORRISPETTIVO' ? 'default' : 'outline'}
                  onClick={() => handleFilter('CORRISPETTIVO')}
                >
                  Corrispettivi
                </Button>
                <Button
                  variant={statusFilter === null ? 'default' : 'outline'}
                  onClick={() => handleFilter(null)}
                >
                  Tutti
                </Button>
              </div>
              <Input
                type="date"
                placeholder="Data da..."
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                onBlur={handleDateFilter}
              />
              <Input
                type="date"
                placeholder="Data a..."
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                onBlur={handleDateFilter}
              />
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle>Ordini ({orders.length})</CardTitle>
            <CardDescription>
              Pagina {page} di {totalPages}
              {selectedOrders.length > 0 && (
                <span className="ml-2 text-sm text-blue-600">
                  {selectedOrders.length} selezionati
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Caricamento ordini...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nessun ordine trovato
              </div>
            ) : (
              <>
                {/* Batch Actions */}
                {selectedOrders.length > 0 && (
                  <div className="mb-4 flex gap-2">
                    <Button
                      onClick={handleRetryInvoices}
                      variant="outline"
                      size="sm"
                    >
                      Riprova Fatture ({selectedOrders.length})
                    </Button>
                    <Button
                      onClick={handleResetErrors}
                      variant="outline"
                      size="sm"
                    >
                      Reset Errori ({selectedOrders.length})
                    </Button>
                    <Button
                      onClick={handleSelectAll}
                      variant="outline"
                      size="sm"
                    >
                      Deseleziona Tutti
                    </Button>
                  </div>
                )}
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <input
                          type="checkbox"
                          checked={selectedOrders.length === orders.length}
                          onChange={handleSelectAll}
                          className="mr-2"
                        />
                      </TableHead>
                      <TableHead>Ordine</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Totale</TableHead>
                      <TableHead>P.IVA</TableHead>
                      <TableHead>Stato Fattura</TableHead>
                      <TableHead>Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedOrders.includes(order.shopifyOrderId)}
                            onChange={() => handleSelectOrder(order.shopifyOrderId)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {order.orderNumber}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {order.user.firstName} {order.user.lastName}
                            </div>
                            <div className="text-sm text-gray-500">
                              {order.user.email}
                            </div>
                            {order.user.billingProfile?.companyName && (
                              <div className="text-sm text-gray-500">
                                {order.user.billingProfile.companyName}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Intl.NumberFormat('it-IT', {
                            style: 'currency',
                            currency: order.currency || 'EUR',
                          }).format(order.totalPrice)}
                        </TableCell>
                        <TableCell>
                          {order.hasVatProfile ? (
                            <Badge variant="success">Sì</Badge>
                          ) : (
                            <Badge variant="secondary">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {getInvoiceStatusBadge(order.invoiceStatus)}
                          {order.lastError && (
                            <div className="text-xs text-red-500 mt-1">
                              {order.lastError}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            {order.invoiceStatus === 'PENDING' && order.hasVatProfile && (
                              <Button
                                size="sm"
                                onClick={() => handleIssueInvoice(order.shopifyOrderId)}
                                disabled={issuingInvoice === order.shopifyOrderId}
                              >
                                {issuingInvoice === order.shopifyOrderId ? 'Emissione...' : 'Emetti Fattura'}
                              </Button>
                            )}
                            {order.invoiceStatus === 'ISSUED' && order.invoiceId && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled
                              >
                                Fattura: {order.invoiceId}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center mt-8 space-x-2">
            <Button
              variant="outline"
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
            >
              Precedente
            </Button>
            <span className="px-4 py-2 text-sm text-gray-700">
              Pagina {page} di {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
            >
              Successivo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}