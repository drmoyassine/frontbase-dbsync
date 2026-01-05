/**
 * Phone Renderer - International phone number input with country picker.
 */

import React from 'react';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, and, isStringControl, optionIs, ControlProps } from '@jsonforms/core';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Label } from '@/components/ui/label';
import { columnToLabel } from '@/lib/schemaToJsonSchema';

interface PhoneRendererProps extends ControlProps { }

const PhoneRendererComponent: React.FC<PhoneRendererProps> = ({
  data,
  handleChange,
  path,
  label,
  schema,
  uischema,
  enabled,
  errors,
}) => {
  const isReadOnly = uischema?.options?.readonly ?? false;
  const displayLabel = label || columnToLabel(path.split('.').pop() || '');

  return (
    <div className="space-y-2">
      <Label htmlFor={path} className={errors ? 'text-destructive' : ''}>
        {displayLabel}
        {schema?.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <PhoneInput
        international
        countryCallingCodeEditable={false}
        defaultCountry="US"
        value={data ?? ''}
        onChange={(value) => handleChange(path, value || undefined)}
        disabled={!enabled || isReadOnly}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${errors ? 'border-destructive' : ''}`}
      />
      {errors && (
        <p className="text-sm text-destructive">{errors}</p>
      )}
      <style>{`
        .PhoneInput {
          display: flex;
          align-items: center;
        }
        .PhoneInputCountry {
          margin-right: 0.5rem;
        }
        .PhoneInputInput {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          font-size: inherit;
        }
        .PhoneInputCountrySelect {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 100%;
          z-index: 1;
          border: 0;
          opacity: 0;
          cursor: pointer;
        }
        .PhoneInputCountryIcon {
          width: 1.5rem;
          height: 1rem;
        }
      `}</style>
    </div>
  );
};

export const PhoneRenderer = withJsonFormsControlProps(PhoneRendererComponent);

// Tester: match when rendererHint is 'phone'
export const phoneRendererTester = rankWith(
  5,
  and(isStringControl, optionIs('rendererHint', 'phone'))
);
