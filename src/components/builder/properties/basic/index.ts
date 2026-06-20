/**
 * Basic Property Components
 * Barrel export for all basic component property panels.
 *
 * NOTE: Heading, Text, Link, Badge, Alert, and Progress are now schema-driven
 * (see registry/propertySchemas.ts) and no longer have bespoke panels here.
 */

// Typography
// (Heading, Text — schema-driven)

// Actions
export { ButtonProperties } from './ButtonProperties';
// (Link — schema-driven)

// Media
export { IconProperties } from './IconProperties';
export { ImageProperties } from './ImageProperties';
export { AvatarProperties } from './AvatarProperties';

// Form Inputs
export { InputProperties } from './InputProperties';
export { TextareaProperties } from './TextareaProperties';
export { SelectProperties } from './SelectProperties';
export { ToggleProperties } from './ToggleProperties';

// Display
// (Badge, Alert, Progress — schema-driven)
export { EmbedProperties } from './EmbedProperties';

// Data
export { ChartProperties } from './ChartProperties';
export { GridProperties } from './GridProperties';
export { KPICardProperties } from './KPICardProperties';
export { RepeaterProperties } from './RepeaterProperties';
