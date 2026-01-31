import * as hono from 'hono';
import { OpenAPIHono } from '@hono/zod-openapi';

declare const app: OpenAPIHono<hono.Env, {}, "/">;

export { app as default };
