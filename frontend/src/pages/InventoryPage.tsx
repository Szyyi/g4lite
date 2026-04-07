import { useState } from 'react';
import { Box, Typography, TextField, MenuItem, InputAdornment, Skeleton, Alert, Button } from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { useQuery } from '@tanstack/react-query';
import { tokens } from '../tokens';
import { itemsApi, categoriesApi } from '../api/items';
import { useAuth } from '../hooks/useAuth';
import type { ItemBrief } from '../types';
import ItemCard from '../components/inventory/ItemCard';
import ItemDetailDrawer from '../components/inventory/ItemDetailDrawer';
import SignOutForm from '../components/signout/SignOutForm';
import EmptyState from '../components/common/EmptyState';

const MiniStat = ({ label, value }: { label: string; value: string | number }) => (
  <Box className="flex items-center gap-2">
    <Typography sx={{ fontSize: '0.5625rem', fontFamily: tokens.font.mono, color: tokens.text.tertiary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {label}
    </Typography>
    <Typography sx={{ fontSize: '0.8125rem', fontFamily: tokens.font.mono, fontWeight: 600, color: tokens.text.primary }}>
      {value}
    </Typography>
  </Box>
);

const InventoryPage = () => {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [selectedItem, setSelectedItem] = useState<ItemBrief | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signOutItem, setSignOutItem] = useState<ItemBrief | null>(null);

  const { data: categoriesData } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.list() });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['items', search, categoryId],
    queryFn: () => itemsApi.list({ search, category_id: categoryId || undefined, page_size: 50 }),
  });

  const totalAvailable = data?.items.reduce((sum: number, i: ItemBrief) => sum + i.available_quantity, 0) ?? 0;
  const totalCheckedOut = data?.items.reduce((sum: number, i: ItemBrief) => sum + i.checked_out_count, 0) ?? 0;

  const handleSelectItem = (item: ItemBrief) => {
    setSelectedItem(item);
    setDrawerOpen(true);
  };

  const handleSignOut = (item: ItemBrief) => {
    setDrawerOpen(false);
    setSignOutItem(item);
  };

  return (
    <Box className="flex flex-col gap-5">
      {/* Header */}
      <Box className="flex items-end justify-between">
        <Box>
          <Typography sx={{ fontSize: '0.625rem', fontFamily: tokens.font.mono, color: tokens.text.tertiary, letterSpacing: '0.1em', mb: 0.5 }}>
            EQUIPMENT REGISTER
          </Typography>
          <Typography variant="h2" sx={{ fontSize: '1.375rem' }}>Inventory</Typography>
        </Box>
        {isAdmin && (
          <Button variant="contained" startIcon={<AddOutlinedIcon sx={{ fontSize: 16 }} />} size="small" sx={{ fontSize: '0.75rem' }}>
            Add Item
          </Button>
        )}
      </Box>

      {/* Stats + Filters bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          px: 2,
          background: tokens.surface.raised,
          border: `1px solid ${tokens.surface.border}`,
          borderRadius: tokens.radius.md,
        }}
      >
        <Box className="flex items-center gap-5">
          <TextField
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ width: 240, '& .MuiOutlinedInput-root': { background: tokens.surface.sunken } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon sx={{ color: tokens.text.tertiary, fontSize: 16 }} />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
            size="small"
            sx={{ minWidth: 160, '& .MuiOutlinedInput-root': { background: tokens.surface.sunken } }}
            label="Category"
          >
            <MenuItem value="">All</MenuItem>
            {(Array.isArray(categoriesData) ? categoriesData : []).map((c: { id: number; name: string }) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </TextField>
        </Box>
        <Box className="flex items-center gap-5">
          <MiniStat label="Items" value={data?.total ?? '—'} />
          <Box sx={{ width: 1, height: 16, background: tokens.surface.border }} />
          <MiniStat label="Available" value={totalAvailable} />
          <Box sx={{ width: 1, height: 16, background: tokens.surface.border }} />
          <MiniStat label="Out" value={totalCheckedOut} />
        </Box>
      </Box>

      {/* Grid */}
      {isError && <Alert severity="error">Failed to load inventory.</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Box key={i} sx={{ background: tokens.surface.raised, border: `1px solid ${tokens.surface.border}`, borderRadius: tokens.radius.lg, overflow: 'hidden' }}>
              <Box sx={{ p: 1.5, background: tokens.surface.overlay, borderBottom: `1px solid ${tokens.surface.border}` }}>
                <Skeleton width="30%" height={12} />
              </Box>
              <Box sx={{ p: 2 }}>
                <Skeleton width="75%" height={16} />
                <Skeleton width="90%" height={12} sx={{ mt: 1 }} />
              </Box>
              <Box sx={{ p: 2, borderTop: `1px solid ${tokens.surface.border}`, display: 'flex', gap: 3 }}>
                <Skeleton width="25%" height={24} />
                <Skeleton width="25%" height={24} />
                <Skeleton width="25%" height={24} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : data?.items.length === 0 ? (
        <EmptyState
          icon={<InventoryOutlinedIcon sx={{ fontSize: 40 }} />}
          title="No items found"
          description={search ? 'Try adjusting your search or filter' : 'The inventory is empty'}
        />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
          {data?.items.map((item: ItemBrief) => (
            <ItemCard key={item.id} item={item} onSelect={handleSelectItem} />
          ))}
        </Box>
      )}

      <ItemDetailDrawer item={selectedItem} open={drawerOpen} onClose={() => setDrawerOpen(false)} onSignOut={handleSignOut} />
      <SignOutForm item={signOutItem} open={!!signOutItem} onClose={() => setSignOutItem(null)} />
    </Box>
  );
};

export default InventoryPage;