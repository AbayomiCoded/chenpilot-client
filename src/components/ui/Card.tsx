'use client';

import React from 'react';
import { cn } from '@/utils/cn';
import { CardProps } from '@/types';

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  children,
  className,
  actions,
  ...props
}) => {
  return (
    <div className={cn(
      'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700',
      className
    )} {...props}>
      {(title || subtitle || actions) && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              {title && (
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex items-center space-x-2">
                {actions}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="px-6 py-4">
        {children}
      </div>
    </div>
  );
};
