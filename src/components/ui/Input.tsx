'use client';

import React from 'react';
import { cn } from '@/utils/cn';
import { InputProps } from '@/types';

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, required, disabled, className, ...props }, ref) => {
    const ariaLabel = props['aria-label'] ?? label ?? undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={props.id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500 dark:focus:ring-primary-400 dark:focus:border-primary-400',
            error && 'border-red-500 focus:ring-red-500 focus:border-red-500',
            className
          )}
          disabled={disabled}
          aria-label={ariaLabel}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
