'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CreditNote {
  id: string;
  orderId: string;
  reason: string;
  totalAmount: number;
  status: 'ISSUED' | 'PENDING' | 'ERROR' | 'FOREIGN';
  sdiCreditId?: string;
  createdAt: string;
  order?: {
    orderNumber: string;
    totalPrice: number;
    currency: string;
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
  };
}

export default function CreditNotesPage() {
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [issuingCreditNote, setIssuingCreditNote] = useState<string | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);

  // Carica note di credito
  useEffect(() => {
    loadCreditNotes();
  }, [page, search, statusFilter]);

  const loadCreditNotes = async () => {
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

      const response = await fetch(`/api/credit-notes/issue?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin'}`,
        },
      });

      if (!response.ok) {
        throw new Error('Errore nel caricamento note di credito');
      }

      const data = await response.json();
      setCreditNotes(data.creditNotes || []);
      setTotalPages(data.pagination?.pages || 1);
    } catch (err) {
      console.error('Error loading credit notes:', err);
      setError('Errore nel caricamento note di credito');
    } finally {
      setLoading(false);
    }
  };

  const handleIssueCreditNote = async (orderId: string, reason: string) => {
    setIssuingCreditNote(orderId);
    try {
      const response = await fetch('/api/credit-notes/issue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin'}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, reason }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore durante emissione nota di credito');
      }

      const data = await response.json();
      alert(`Nota di credito emessa: ${data.sdiCreditId || data.id}`);
      
      // Ricarica la lista note di credito
      loadCreditNotes();
    } catch (err) {
      console.error('Error issuing credit note:', err);
      alert(err instanceof Error ? err.message : 'Errore durante emissione nota di credito');
    } finally {
      setIssuingCreditNote(null);
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

  const handleSelectNote = (noteId: string) => {
    setSelectedNotes(prev => 
      prev.includes(noteId) 
        ? prev.filter(id => id !== noteId)
        : [...prev, noteId]
    );
  };

  const handleSelectAll = () => {
    setSelectedNotes(creditNotes.map(note => note.id));
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ISSUED':
        return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">Emessa</span>;
      case 'PENDING':
        return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800">In Attesa</span>;
      case 'ERROR':
        return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-800">Errore</span>;
      case 'FOREIGN':
        return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">Estero</span>;
      default:
        return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Gestione Note di Credito
          </h1>
          <p className="mt-2 text-gray-600">
            Visualizza e gestisci le note di credito per resi e storni
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
              Operazioni di gestione note di credito
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={() => window.location.href = '/admin/customers'}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              >
                Gestione Clienti
              </button>
              <button 
                onClick={() => window.location.href = '/admin/orders'}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              >
                Gestione Ordini
              </button>
              <button 
                onClick={() => window.location.href = '/admin'}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              >
                Dashboard Admin
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filtri</CardTitle>
            <CardDescription>
              Filtra note di credito per stato o ricerca
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-4">
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
                  variant={statusFilter === null ? 'default' : 'outline'}
                  onClick={() => handleFilter(null)}
                >
                  Tutte
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Credit Notes Table */}
        <Card>
          <CardHeader>
            <CardTitle>Note di Credito ({creditNotes.length})</CardTitle>
            <CardDescription>
              Pagina {page} di {totalPages}
              {selectedNotes.length > 0 && (
                <span className="ml-2 text-sm text-blue-600">
                  {selectedNotes.length} selezionate
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Caricamento note di credito...</p>
              </div>
            ) : creditNotes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nessuna nota di credito trovata
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <input
                          type="checkbox"
                          checked={selectedNotes.length === creditNotes.length}
                          onChange={handleSelectAll}
                          className="mr-2"
                        />
                      </TableHead>
                      <TableHead>Ordine</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Importo</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead>Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditNotes.map((note) => (
                      <TableRow key={note.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedNotes.includes(note.id)}
                            onChange={() => handleSelectNote(note.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {note.order?.orderNumber}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {note.order?.user.firstName} {note.order?.user.lastName}
                            </div>
                            <div className="text-sm text-gray-500">
                              {note.order?.user.email}
                            </div>
                            {note.order?.user.billingProfile?.companyName && (
                              <div className="text-sm text-gray-500">
                                {note.order?.user.billingProfile.companyName}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Intl.NumberFormat('it-IT', {
                            style: 'currency',
                            currency: note.order?.currency || 'EUR',
                          }).format(note.totalAmount)}
                        </TableCell>
                        <TableCell>
                          {note.reason}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(note.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            {note.status === 'PENDING' && (
                              <button
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 py-1"
                                onClick={() => handleIssueCreditNote(note.orderId, 'Reso cliente')}
                                disabled={issuingCreditNote === note.orderId}
                              >
                                {issuingCreditNote === note.orderId ? 'Emissione...' : 'Emetti Nota'}
                              </button>
                            )}
                            {note.status === 'ISSUED' && note.sdiCreditId && (
                              <button
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 py-1"
                                disabled
                              >
                                SDI: {note.sdiCreditId}
                              </button>
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
            <button
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
            >
              Precedente
            </button>
            <span className="px-4 py-2 text-sm text-gray-700">
              Pagina {page} di {totalPages}
            </span>
            <button
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
            >
              Successivo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}