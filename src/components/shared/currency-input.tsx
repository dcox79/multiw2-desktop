'use client';

import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CurrencyInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-invalid'?: boolean;
  disabled?: boolean;
}

function formatWithCommas(num: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = '0',
  className,
  id,
  'aria-invalid': ariaInvalid,
  disabled,
}: CurrencyInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState('');

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setDisplayValue(value !== undefined ? String(value) : '');
  }, [value]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const parsed = parseFloat(displayValue.replace(/,/g, ''));
    if (!isNaN(parsed)) {
      onChange(parsed);
    } else if (displayValue === '') {
      onChange(undefined);
    }
  }, [displayValue, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    setDisplayValue(raw);
  }, []);

  const formattedValue = !isFocused && value !== undefined
    ? formatWithCommas(value)
    : displayValue;

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
        $
      </span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={formattedValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn('pl-7 font-mono tabular-nums', className)}
        aria-invalid={ariaInvalid}
        disabled={disabled}
      />
    </div>
  );
}
