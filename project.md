PDFX-xBlock: Open edX PDF reader with annotation tools (highlight, draw, scribble).
PDFX-xBlock: is developing in open edx docker containers.
Use MCP for browser verification. Auto-reload enabled in Docker - no restarts needed. SO DO NOT restart "tutor_dev-lms-1" and tutor_dev-cms-1
DO NOT add unnecessary console.log,  console.warn, console.debug, add only when its nessary. When you debug you MUST remove old unnessary "console.log" lines.
* **File Storage:** Use Open edX contentstore
  ```python
  from xmodule.contentstore.django import contentstore
  from xmodule.contentstore.content import StaticContent
  from opaque_keys.edx.keys import AssetKey
  ```

**Structure:**

* **Python:** `pdfx-xblock/pdfx/pdfx.py`
* **Logs:** `tutor dev logs lms/cms --tail 100`

* **JavaScript:**
  * Source: `pdfx-xblock/pdfx/static/js/src/`
  * Build output: `pdfx-xblock/pdfx/static/js/build/`
  * Configs: `vite.config.js` (LMS), `vite.edit.config.js` (Studio)
  * Auto-build active - don't run build commands manually

* **CSS:** `pdf.css` (LMS), `pdf_edit.css` (Studio)

**Note:** Write robust code, avoid quick silly fixes.

JS: DO NOT Import js files dynamicaly. it does not support.

DO NOT write extensive explanations.

