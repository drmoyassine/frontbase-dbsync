const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

module.exports = (dbManager) => {
    // GET /embed.js - Serve the smart embed script
    router.get('/embed.js', (req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.send(`
(function() {
  function initEmbed() {
    const scripts = document.querySelectorAll('script[src*="/embed.js"][data-form-id]');
    
    scripts.forEach(script => {
      if (script.dataset.processed) return;
      script.dataset.processed = 'true';
      
      const formId = script.dataset.formId;
      const width = script.dataset.width || '100%';
      const baseUrl = script.src.split('/embed.js')[0];
      
      const iframe = document.createElement('iframe');
      iframe.src = \`\${baseUrl}/embed/auth/\${formId}\`;
      iframe.style.width = width;
      iframe.style.border = 'none';
      iframe.style.overflow = 'hidden';
      iframe.scrolling = 'no';
      iframe.style.minHeight = '300px'; // Initial height
      
      script.parentNode.insertBefore(iframe, script.nextSibling);

      // Listen for resize messages
      window.addEventListener('message', (event) => {
        if (event.origin !== baseUrl) return;
        
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data.type === 'frontbase-resize' && data.formId === formId) {
            iframe.style.height = \`\${data.height}px\`;
          }
        } catch (e) {
          // Ignore parse errors from other sources
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmbed);
  } else {
    initEmbed();
  }
})();
    `);
    });

    // GET /embed/auth/:id - Serve the actual form container (Iframe content)
    router.get('/auth/:id', (req, res) => {
        const { id } = req.params;
        const form = dbManager.getAuthForm(id);

        // We serve a special HTML that loads the React App but mounted at a specific route?
        // Actually, to make this work seamlessly with the existing React/Vite setup, 
        // we should route this to the main index.html but maybe with a special query param 
        // or just let the React Router handle "/embed/auth/:id" if we add it there.

        // HOWEVER, to ensure isolation and specific styling, we might want to inject 
        // the config directly into the HTML to avoid an extra network roundtrip.

        // For now, let's rely on the React App handling the route `/embed/auth/:id`.
        // The server just needs to return the main index.html.

        const indexPath = path.join(__dirname, '../../public/index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(503).send('Builder functionality not available');
        }
    });

    return router;
};
