import React from 'react';
import { Config } from '@measured/puck';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// Basic Puck configuration for core components
export const puckConfig: Config = {
  root: {
    render: ({ children }) => 
      React.createElement('div', { className: 'min-h-screen w-full bg-background' }, children),
  },
  components: {
    Button: {
      fields: {
        text: { type: 'text' },
        variant: {
          type: 'select',
          options: [
            { label: 'Default', value: 'default' },
            { label: 'Secondary', value: 'secondary' },
            { label: 'Outline', value: 'outline' },
            { label: 'Ghost', value: 'ghost' },
            { label: 'Destructive', value: 'destructive' },
          ],
        },
        size: {
          type: 'select',
          options: [
            { label: 'Default', value: 'default' },
            { label: 'Small', value: 'sm' },
            { label: 'Large', value: 'lg' },
            { label: 'Icon', value: 'icon' },
          ],
        },
      },
      defaultProps: {
        text: 'Click me',
        variant: 'default',
        size: 'default',
      },
      render: ({ text, variant, size }) => 
        React.createElement(Button, { variant, size }, text),
    },
    Card: {
      fields: {
        title: { type: 'text' },
        description: { type: 'text' },
        content: { type: 'textarea' },
      },
      defaultProps: {
        title: 'Card Title',
        description: 'Card description',
        content: 'Card content goes here...',
      },
      render: ({ title, description, content }) => 
        React.createElement(Card, {},
          React.createElement(CardHeader, {},
            React.createElement(CardTitle, {}, title),
            React.createElement(CardDescription, {}, description)
          ),
          React.createElement(CardContent, {},
            React.createElement('p', {}, content)
          )
        ),
    },
    Input: {
      fields: {
        placeholder: { type: 'text' },
        type: {
          type: 'select',
          options: [
            { label: 'Text', value: 'text' },
            { label: 'Email', value: 'email' },
            { label: 'Password', value: 'password' },
            { label: 'Number', value: 'number' },
          ],
        },
      },
      defaultProps: {
        placeholder: 'Enter text...',
        type: 'text',
      },
      render: ({ placeholder, type }) => 
        React.createElement(Input, { placeholder, type }),
    },
    Badge: {
      fields: {
        text: { type: 'text' },
        variant: {
          type: 'select',
          options: [
            { label: 'Default', value: 'default' },
            { label: 'Secondary', value: 'secondary' },
            { label: 'Destructive', value: 'destructive' },
            { label: 'Outline', value: 'outline' },
          ],
        },
      },
      defaultProps: {
        text: 'Badge',
        variant: 'default',
      },
      render: ({ text, variant }) => 
        React.createElement(Badge, { variant }, text),
    },
    Text: {
      fields: {
        text: { type: 'textarea' },
        size: {
          type: 'select',
          options: [
            { label: 'Small', value: 'sm' },
            { label: 'Default', value: 'base' },
            { label: 'Large', value: 'lg' },
            { label: 'Extra Large', value: 'xl' },
          ],
        },
      },
      defaultProps: {
        text: 'Your text here...',
        size: 'base',
      },
      render: ({ text, size }) => 
        React.createElement('p', { className: `text-${size} text-foreground` }, text),
    },
    Heading: {
      fields: {
        text: { type: 'text' },
        level: {
          type: 'select',
          options: [
            { label: 'H1', value: '1' },
            { label: 'H2', value: '2' },
            { label: 'H3', value: '3' },
            { label: 'H4', value: '4' },
            { label: 'H5', value: '5' },
            { label: 'H6', value: '6' },
          ],
        },
      },
      defaultProps: {
        text: 'Your heading',
        level: '2',
      },
      render: ({ text, level }) => {
        const Tag = `h${level}` as keyof JSX.IntrinsicElements;
        const sizeClass = {
          '1': 'text-4xl font-bold',
          '2': 'text-3xl font-semibold',
          '3': 'text-2xl font-semibold',
          '4': 'text-xl font-semibold',
          '5': 'text-lg font-medium',
          '6': 'text-base font-medium',
        }[level];
        
        return React.createElement(Tag, { className: `${sizeClass} text-foreground` }, text);
      },
    },
  },
};