The PDFX-xBlock is an Open edX xBlock providing an advanced PDF reader, including features such as scribbling, highlighting, drawing shapes, and clearing annotations.

**Development Workflow:**

* Use MCP to verify browser-based changes. If MCP's `getConsoleLogs` returns empty, retry after 10 seconds since the browser may be occupied by other tasks.

* Code development occurs in Docker containers configured for automatic reload upon code changes. Do not execute code locally, and container restarts are unnecessary.

* Uploading File Storeage
  ** we MUST use Open edX contentstore as uploaded file storage.
    ```
    from xmodule.contentstore.django import contentstore
    from xmodule.contentstore.content import StaticContent
    from opaque_keys.edx.keys import AssetKey
    import uuid
    ```

**File Structure & Guidelines:**

* **Python:**

  * Primary implementation file:

    * `pdfx-xblock/pdfx/pdfx.py`


* Django logs: YOU DO NOT NEED TO do the restart as it automatically reload the changes.
  * For LMS: tutor dev logs lms --tail 100
  * For CMS (studio): tutor dev logs cms --tail 100

* **JavaScript:**

  * Source folder:

    * `pdfx-xblock/pdfx/static/js/modern`

  * After modifications, Do not try to build JS. I already run "npm run watch" in separate terminal.

  * Add relevant console logs during development for debugging, and promptly remove old or unnecessary logs.

  * Configuration files:

    * LMS view (`student_view`): `vite.config.js`
    * CMS/Studio view (`studio_view`): `vite.edit.config.js`
    * Build configurations: see `package.json`

* **CSS:**

  * All CSS modifications should exclusively occur in:

    * `pdf.css` (LMS/student view)
    * `pdf_edit.css` (CMS/studio view)

**Important:** Always implement robust, well-structured code. Avoid temporary solutions or quick fixes.

