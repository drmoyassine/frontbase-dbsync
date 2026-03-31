/**
 * Embed Routes — Auth Form Embed for External Websites
 * 
 * Provides two public endpoints:
 *   GET /api/embed/embed.js         — Vanilla JS loader script (creates iframe)
 *   GET /api/embed/auth/:id   — Standalone auth page rendered inside the iframe
 * 
 * Self-sufficient: Uses Supabase JS from CDN. No FastAPI calls at runtime.
 * Auth form config is stored in the edge DB (baked at publish time).
 * 
 * Flow:
 *   External site loads <script src="https://edge/embed.js" data-form-id="...">
 *   → embed.js creates an iframe pointing to /embed/auth/:formId
 *   → the iframe loads a standalone HTML page with the Supabase auth form
 *   → postMessage resizes the iframe to fit the form
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { stateProvider } from '../storage/index.js';

const embedRoute = new OpenAPIHono();

// =============================================================================
// GET /embed.js — Vanilla JS loader (self-contained, no dependencies)
// =============================================================================

embedRoute.get('/embed.js', (c) => {
    c.header('Content-Type', 'application/javascript');
    c.header('Cache-Control', 'public, max-age=3600'); // Cache 1h
    c.header('Access-Control-Allow-Origin', '*');

    return c.body(`(function(){
  function initEmbed(){
    var scripts=document.querySelectorAll('script[src*="/embed.js"][data-form-id]');
    scripts.forEach(function(script){
      if(script.dataset.processed)return;
      script.dataset.processed='true';
      var formId=script.dataset.formId;
      var width=script.dataset.width||'100%';
      var baseUrl=script.src.split('/api/embed/embed.js')[0];
      var iframe=document.createElement('iframe');
      iframe.src=baseUrl+'/api/embed/auth/'+formId;
      iframe.style.width=width;
      iframe.style.border='none';
      iframe.style.overflow='hidden';
      iframe.scrolling='no';
      iframe.style.minHeight='400px';
      iframe.style.borderRadius='12px';
      script.parentNode.insertBefore(iframe,script.nextSibling);
      window.addEventListener('message',function(event){
        if(event.origin!==baseUrl)return;
        try{
          var data=typeof event.data==='string'?JSON.parse(event.data):event.data;
          if(data.type==='frontbase-resize'&&data.formId===formId){
            iframe.style.height=data.height+'px';
          }
          if(data.type==='frontbase-auth-success'){
            if(data.user){
               localStorage.setItem('frontbase_user', JSON.stringify(data.user));
            }
            window.location.href=data.redirectUrl;
          }
        }catch(e){}
      });
    });
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initEmbed);
  }else{
    initEmbed();
  }
})();`);
});

// =============================================================================
// GET /embed/auth/:formId — Standalone auth page (rendered in iframe)
// =============================================================================

embedRoute.get('/auth/:formId', async (c) => {
    const formId = c.req.param('formId');

    // Read auth form config from project settings (synced at publish time)
    let formConfig: any = null;
    try {
        const settings = await stateProvider.getProjectSettings();
        if (settings.authForms) {
            const formsMap = JSON.parse(settings.authForms);
            formConfig = formsMap[formId] || null;
        }
    } catch (err) {
        console.warn('[Embed] Could not read auth forms from settings:', err);
    }

    // Use form config if available, otherwise use defaults
    const type = formConfig?.type || 'both';
    const title = formConfig?.name || formConfig?.title || 'Welcome';
    const description = formConfig?.description || '';
    const logoUrl = formConfig?.logoUrl || formConfig?.config?.logoUrl || '';
    const primaryColor = formConfig?.config?.primaryColor || formConfig?.primaryColor || '#18181b';
    const providers = formConfig?.config?.providers || formConfig?.providers || [];
    const magicLink = formConfig?.config?.magicLink || formConfig?.magicLink || false;
    const showLinks = formConfig?.config?.showLinks !== false;
    const redirectUrl = formConfig?.redirectUrl || formConfig?.config?.redirectUrl || '';

    const defaultIsLogin = type !== 'signup';
    const showToggle = type === 'both';
    const hasSocial = providers.length > 0;

    const socialButtons = providers.map((p: string) => {
        const name = p.charAt(0).toUpperCase() + p.slice(1);
        return `<button type="button" class="fb-social-btn" data-provider="${esc(p)}">Continue with ${esc(name)}</button>`;
    }).join('\n');

    c.header('Content-Type', 'text/html; charset=utf-8');
    c.header('Cache-Control', 'no-cache');

    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#18181b}
        .fb-auth-container{max-width:400px;margin:0 auto;padding:2rem}
        .fb-logo{text-align:center;margin-bottom:1.5rem}
        .fb-logo img{max-height:48px;max-width:200px}
        h1{font-size:1.5rem;font-weight:700;text-align:center;margin-bottom:0.25rem}
        .fb-desc{color:#71717a;font-size:0.875rem;text-align:center;margin-bottom:1.5rem}
        .fb-spacer{margin-bottom:1.5rem}
        .fb-divider{display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem}
        .fb-divider-line{flex:1;height:1px;background:#e4e4e7}
        .fb-divider-text{color:#a1a1aa;font-size:0.75rem;text-transform:uppercase}
        .fb-social-btn{width:100%;padding:0.625rem;background:#fff;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.8125rem;cursor:pointer;transition:background 0.2s;font-family:inherit;margin-bottom:0.5rem}
        .fb-social-btn:hover{background:#f4f4f5}
        .fb-error{display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:0.625rem;border-radius:0.375rem;font-size:0.8125rem;margin-bottom:0.75rem}
        .fb-form{display:flex;flex-direction:column;gap:0.75rem}
        .fb-label{display:block;font-size:0.8125rem;font-weight:500;color:#374151;margin-bottom:0.25rem}
        .fb-input{width:100%;padding:0.5rem 0.75rem;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.875rem;outline:none;transition:border-color 0.2s;box-sizing:border-box}
        .fb-input:focus{border-color:${esc(primaryColor)}}
        .fb-submit{width:100%;padding:0.625rem;background:${esc(primaryColor)};color:#fff;border:none;border-radius:0.375rem;font-size:0.875rem;font-weight:600;cursor:pointer;transition:opacity 0.2s}
        .fb-submit:hover{opacity:0.9}
        .fb-submit:disabled{opacity:0.6;cursor:not-allowed}
        .fb-toggle{text-align:center;margin-top:1rem;font-size:0.8125rem;color:#71717a}
        .fb-toggle a{color:${esc(primaryColor)};font-weight:500;text-decoration:none;margin-left:0.25rem}
        .fb-success{display:none;text-align:center;padding:2rem 1rem;color:#16a34a;font-size:0.875rem}
    </style>
</head>
<body>
<div class="fb-auth-container">
    ${logoUrl ? `<div class="fb-logo"><img src="${esc(logoUrl)}" alt="Logo"></div>` : ''}
    <h1 id="fb-auth-title">${esc(title)}</h1>
    ${description ? `<p class="fb-desc">${esc(description)}</p>` : '<div class="fb-spacer"></div>'}

    ${hasSocial ? `
    <div>${socialButtons}</div>
    <div class="fb-divider">
        <div class="fb-divider-line"></div>
        <span class="fb-divider-text">or</span>
        <div class="fb-divider-line"></div>
    </div>` : ''}

    <div id="fb-auth-error" class="fb-error"></div>
    <div id="fb-auth-success" class="fb-success">
        <p>✓ Check your email for a confirmation link.</p>
    </div>

    <form id="fb-auth-form" class="fb-form" action="/api/auth/login" method="POST">
        <input type="hidden" name="redirectTo" value="${esc(redirectUrl)}">
        <input type="hidden" name="isEmbed" value="true">
        <input type="hidden" name="formId" value="${esc(formId)}">
        <div>
            <label for="fb-email" class="fb-label">Email</label>
            <input id="fb-email" name="email" class="fb-input" type="email" required autocomplete="email" placeholder="you@example.com">
        </div>
        <div>
            <label for="fb-password" class="fb-label">Password</label>
            <input id="fb-password" name="password" class="fb-input" type="password" required autocomplete="current-password" placeholder="••••••••" minlength="6">
        </div>
        <button id="fb-auth-submit" class="fb-submit" type="submit">
            ${defaultIsLogin ? 'Sign In' : 'Sign Up'}
        </button>
    </form>

    ${showToggle ? `
    <p class="fb-toggle">
        <span id="fb-toggle-text">${defaultIsLogin ? "Don't have an account?" : 'Already have an account?'}</span>
        <a href="#" id="fb-toggle-link" onclick="fbToggleMode();return false">${defaultIsLogin ? 'Sign Up' : 'Sign In'}</a>
    </p>` : ''}
</div>

<script>
(function(){
    var REDIRECT_URL='${esc(redirectUrl)}';
    var FORM_ID='${esc(formId)}';
    var isLoginMode=${defaultIsLogin};
    var form=document.getElementById('fb-auth-form');
    var errorDiv=document.getElementById('fb-auth-error');
    var successDiv=document.getElementById('fb-auth-success');
    var submitBtn=document.getElementById('fb-auth-submit');

    // Resize notification for parent iframe
    function notifyResize(){
        var h=document.documentElement.scrollHeight;
        window.parent.postMessage({type:'frontbase-resize',formId:FORM_ID,height:h+20},'*');
    }
    new ResizeObserver(notifyResize).observe(document.body);
    setTimeout(notifyResize,100);

    // Show error from URL params (server-side redirect on auth failure)
    var urlParams=new URLSearchParams(window.location.search);
    var authError=urlParams.get('auth_error');
    var authMessage=urlParams.get('auth_message');
    if(authError){
        errorDiv.textContent=authError;
        errorDiv.style.display='block';
        notifyResize();
    }
    if(authMessage){
        form.style.display='none';
        successDiv.textContent=authMessage;
        successDiv.style.display='block';
        notifyResize();
    }

    form.addEventListener('submit',function(){
        submitBtn.disabled=true;
        submitBtn.textContent=isLoginMode?'Signing in...':'Signing up...';
    });

    // Toggle login/signup mode
    window.fbToggleMode=function(){
        isLoginMode=!isLoginMode;
        form.action=isLoginMode?'/api/auth/login':'/api/auth/signup';
        document.getElementById('fb-auth-title').textContent=isLoginMode?'${esc(type === 'both' ? 'Welcome Back' : title)}':'Create an Account';
        submitBtn.textContent=isLoginMode?'Sign In':'Sign Up';
        document.getElementById('fb-toggle-text').textContent=isLoginMode?"Don't have an account?":'Already have an account?';
        document.getElementById('fb-toggle-link').textContent=isLoginMode?'Sign Up':'Sign In';
        document.getElementById('fb-password').autocomplete=isLoginMode?'current-password':'new-password';
        errorDiv.style.display='none';
        successDiv.style.display='none';
        form.style.display='block';
        notifyResize();
    };
})();
</script>
</body>
</html>`);
});

// =============================================================================
// Helpers
// =============================================================================

function esc(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export { embedRoute };
