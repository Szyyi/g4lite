/**
 * G4Light — FilterBar
 * =====================
 *
 * Reusable filter/search controls bar for list and table pages.
 * Sits between the page header and the data display.
 *
 * Features:
 *  - Debounced search input (300ms)
 *  - Configurable dropdown filters
 *  - Active filter chips with remove action
 *  - Clear all filters button
 *  - Right-side slot for export button or view toggle
 *  - Result count display
 *
 * Usage:
 *  ```tsx
 *  <FilterBar
 *    searchValue={search}
 *    onSearchChange={setSearch}
 *    searchPlaceholder="Search items..."
 *    filters={[
 *      { key: 'category_id', label: 'Category', options: categoryOptions, value: selectedCategory },
 *      { key: 'criticality', label: 'Criticality', options: criticalityOptions, value: selectedCrit },
 *    ]}
 *    onFilterChange={(key, value) => updateFilter(key, value)}
 *    onClearAll={clearAllFilters}
 *    resultCount={totalItems}
 *    actions={<CSVExportButton />}
 *  />
 *  ```
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  Typography,
  Button,
  Chip,
  FormControl,
  InputLabel,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';
import { tokens } from '../../tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FilterOption {
  value: string | number | boolean;
  label: string;
}

interface FilterConfig {
  /** Unique key matching the API filter parameter name */
  key: string;
  /** Display label */
  label: string;
  /** Available options */
  options: FilterOption[];
  /** Current selected value (empty string = no filter) */
  value: string | number | boolean | '';
  /** Minimum width for the select */
  minWidth?: number;
}

interface FilterBarProps {
  /** Current search input value */
  searchValue: string;
  /** Search change handler (receives debounced value) */
  onSearchChange: (value: string) => void;
  /** Placeholder for search input */
  searchPlaceholder?: string;
  /** Filter configurations */
  filters?: FilterConfig[];
  /** Called when a filter value changes */
  onFilterChange?: (key: string, value: string | number | boolean | '') => void;
  /** Called to reset all filters and search */
  onClearAll?: () => void;
  /** Total result count to display */
  resultCount?: number;
  /** Right-side action slot (export button, view toggle, etc.) */
  actions?: ReactNode;
  /** Debounce delay in ms (default 300) */
  debounceMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Debounce hook
// ─────────────────────────────────────────────────────────────────────────────

const useDebouncedValue = (value: string, delay: number): string => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const FilterBar = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  onFilterChange,
  onClearAll,
  resultCount,
  actions,
  debounceMs = 300,
}: FilterBarProps) => {
  const [localSearch, setLocalSearch] = useState(searchValue);
  const debouncedSearch = useDebouncedValue(localSearch, debounceMs);

  // Sync debounced value to parent
  useEffect(() => {
    if (debouncedSearch !== searchValue) {
      onSearchChange(debouncedSearch);
    }
  }, [debouncedSearch, searchValue, onSearchChange]);

  // Sync parent value to local (for external resets)
  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  // Count active filters
  const activeFilterCount = filters.filter((f) => f.value !== '' && f.value !== undefined).length;
  const hasActiveFilters = activeFilterCount > 0 || searchValue.length > 0;

  const handleClearSearch = useCallback(() => {
    setLocalSearch('');
    onSearchChange('');
  }, [onSearchChange]);

  return (
    <Box className="flex flex-col gap-3">
      {/* Main row: search + filters + actions */}
      <Box className="flex items-center gap-3 flex-wrap">
        {/* Search input */}
        <TextField
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder={searchPlaceholder}
          size="small"
          sx={{
            minWidth: 240,
            maxWidth: 320,
            flex: 1,
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon sx={{ fontSize: 18, color: tokens.text.quartery }} />
              </InputAdornment>
            ),
            endAdornment: localSearch.length > 0 ? (
              <InputAdornment position="end">
                <Button
                  size="small"
                  onClick={handleClearSearch}
                  sx={{
                    minWidth: 'auto',
                    p: 0.25,
                    color: tokens.text.quartery,
                    '&:hover': { color: tokens.text.tertiary },
                  }}
                >
                  <CloseOutlinedIcon sx={{ fontSize: 16 }} />
                </Button>
              </InputAdornment>
            ) : undefined,
          }}
        />

        {/* Dropdown filters */}
        {filters.map((filter) => (
          <FormControl
            key={filter.key}
            size="small"
            sx={{ minWidth: filter.minWidth ?? 140 }}
          >
            <InputLabel sx={{ fontSize: tokens.fontSize.sm }}>
              {filter.label}
            </InputLabel>
            <Select
              value={filter.value}
              label={filter.label}
              onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
              sx={{ fontSize: tokens.fontSize.base }}
            >
              <MenuItem value="">
                <Typography sx={{ color: tokens.text.tertiary, fontSize: tokens.fontSize.base }}>
                  All
                </Typography>
              </MenuItem>
              {filter.options.map((opt) => (
                <MenuItem key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ))}

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Result count */}
        {resultCount !== undefined && (
          <Typography
            sx={{
              fontSize: tokens.fontSize.xs,
              fontFamily: tokens.font.mono,
              color: tokens.text.quartery,
              whiteSpace: 'nowrap',
              letterSpacing: tokens.letterSpacing.wider,
            }}
          >
            {resultCount.toLocaleString()} result{resultCount !== 1 ? 's' : ''}
          </Typography>
        )}

        {/* Actions slot */}
        {actions}
      </Box>

      {/* Active filter chips row */}
      {hasActiveFilters && (
        <Box className="flex items-center gap-2 flex-wrap">
          <FilterListOutlinedIcon
            sx={{
              fontSize: 14,
              color: tokens.text.quartery,
            }}
          />

          {/* Search chip */}
          {searchValue.length > 0 && (
            <Chip
              label={`Search: "${searchValue}"`}
              size="small"
              onDelete={handleClearSearch}
              deleteIcon={<CloseOutlinedIcon sx={{ fontSize: 12 }} />}
              sx={{
                height: 24,
                fontSize: tokens.fontSize.xs,
                background: alpha(tokens.accent.default, 0.08),
                color: tokens.accent.text,
                border: `${tokens.borderWidth.thin} solid ${alpha(tokens.accent.default, 0.15)}`,
                '& .MuiChip-deleteIcon': {
                  color: tokens.accent.text,
                  '&:hover': { color: tokens.text.primary },
                },
              }}
            />
          )}

          {/* Filter chips */}
          {filters
            .filter((f) => f.value !== '' && f.value !== undefined)
            .map((filter) => {
              const selectedOption = filter.options.find(
                (o) => String(o.value) === String(filter.value),
              );
              return (
                <Chip
                  key={filter.key}
                  label={`${filter.label}: ${selectedOption?.label ?? filter.value}`}
                  size="small"
                  onDelete={() => onFilterChange?.(filter.key, '')}
                  deleteIcon={<CloseOutlinedIcon sx={{ fontSize: 12 }} />}
                  sx={{
                    height: 24,
                    fontSize: tokens.fontSize.xs,
                    background: alpha(tokens.text.primary, 0.06),
                    color: tokens.text.secondary,
                    border: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
                    '& .MuiChip-deleteIcon': {
                      color: tokens.text.quartery,
                      '&:hover': { color: tokens.text.secondary },
                    },
                  }}
                />
              );
            })}

          {/* Clear all */}
          {hasActiveFilters && onClearAll && (
            <Button
              size="small"
              variant="text"
              onClick={onClearAll}
              sx={{
                fontSize: tokens.fontSize.xs,
                color: tokens.text.quartery,
                px: 1,
                minWidth: 'auto',
                '&:hover': { color: tokens.text.tertiary },
              }}
            >
              Clear all
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
};

export default FilterBar;