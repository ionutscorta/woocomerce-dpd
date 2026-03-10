(function () {
    // --- helpers ---------------------------------------------------------------
    const ready = (fn) =>
        document.readyState === 'loading'
            ? document.addEventListener('DOMContentLoaded', fn)
            : fn();

    const q  = (sel, ctx) => (ctx || document).querySelector(sel);
    const qa = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

    // Keep the latest chosen values so we can re-push them after rerenders.
    let dpdroLast = {
        id:   (window.dpdroData && dpdroData.pickup)     || '',
        name: (window.dpdroData && dpdroData.pickupName) || '',
        type: (window.dpdroData && dpdroData.pickupType) || ''
    };

    // Inject a tiny stylesheet once (for loader + layout).
    let styleInjected = false;
    function injectStylesOnce() {
        if (styleInjected) return;
        styleInjected = true;
        const css = `
      .wc-block-components-address-form > .dpdro-offices-map { grid-column: 1 / -1 !important; width: 100%; }
      .wc-block-components-address-form .dpdro-offices-map { grid-column: 1 / -1; width: 100%; display: block; }
      .dpdro-offices-map iframe { width: 100%; max-width: 100%; border: 0; display: block; }
      .dpdro-loader { display:flex; align-items:center; gap:.5rem; margin-top:10px; padding:10px 12px;
        border:1px solid #e5e7eb; border-radius:12px; background:#fafafa; font-size:.9rem; }
      .dpdro-spinner { width:16px; height:16px; border:2px solid currentColor; border-bottom-color:transparent;
        border-radius:50%; display:inline-block; animation:dpdro-spin 1s linear infinite; }
      @keyframes dpdro-spin { to { transform: rotate(360deg); } }
    `;
        const tag = document.createElement('style');
        tag.type = 'text/css';
        tag.appendChild(document.createTextNode(css));
        document.head.appendChild(tag);
    }

    function hideWrapperByInput(input) {
        const wrap = input && input.closest('.wc-block-components-text-input');
        if (wrap) wrap.style.display = 'none';
    }

    function getFieldWrapper(input, formRoot) {
        let node = input;
        while (node && node !== formRoot) {
            if (node.nodeType === 1) {
                const className = typeof node.className === 'string' ? node.className : '';
                if (className.indexOf('wc-block-components-address-form__') !== -1) {
                    return node;
                }
            }
            node = node.parentElement;
        }
        return input && input.closest('.wc-block-components-text-input');
    }

    function ensureMapSpacer(shipping, gridCell) {
        const stateWrapper =
            q('.wc-block-components-address-form__state', shipping) ||
            q('[class*="wc-block-components-address-form__state"]', shipping);
        const stateVisible = !!(
            stateWrapper &&
            stateWrapper.offsetParent !== null &&
            window.getComputedStyle(stateWrapper).display !== 'none'
        );

        let spacer = q('.dpdro-map-spacer', shipping);

        if (stateVisible) {
            if (spacer) spacer.remove();
            return gridCell;
        }

        if (!spacer) {
            spacer = document.createElement('div');
            spacer.className = 'wc-block-components-text-input dpdro-map-spacer';
            spacer.setAttribute('aria-hidden', 'true');
            spacer.style.visibility = 'hidden';
            spacer.style.minHeight = '1px';
            spacer.style.pointerEvents = 'none';
        }

        const isAlreadyPositioned =
            spacer.parentNode === shipping &&
            spacer.previousElementSibling === gridCell;

        if (!isAlreadyPositioned) {
            gridCell.insertAdjacentElement('afterend', spacer);
        }

        return spacer;
    }

    // Set value on React-controlled inputs
    function setControlledValue(input, value) {
        if (!input) return;
        const proto = Object.getPrototypeOf(input);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
            || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setApiFields(container, vals) {
        const idEl   = q('input[data-dpdro="pickup-id"]',   container);
        const nameEl = q('input[data-dpdro="pickup-name"]', container);
        const typeEl = q('input[data-dpdro="pickup-type"]', container);

        setControlledValue(idEl,   vals.id   || '');
        setControlledValue(nameEl, vals.name || '');
        setControlledValue(typeEl, vals.type || '');
    }

    // Build the host HTML (label + disabled name + loader + iframe + hidden copies)
    function buildHostHTML() {
        const label    = (window.dpdroData && dpdroData.label)    || 'DPD RO offices map';
        const noOffice = (window.dpdroData && dpdroData.noOffice) || 'No office selected';
        const iframeSrc= (window.dpdroData && dpdroData.iframeSrc)|| '';

        return `
      <label>${label}</label>
      <div class="woocommerce-input-wrapper">
        <input type="text"
               class="input-text js-dpdro-offices-name"
               name="billing_pickup_name"
               placeholder="${noOffice}"
               value="${dpdroLast.name}"
               disabled />

        <div class="dpdro-loader" role="status" aria-live="polite">
          <span class="dpdro-spinner" aria-hidden="true"></span>
          <span class="dpdro-loader-text">${(window.dpdroData && dpdroData.loadingText) || 'Loading map…'}</span>
        </div>

        <iframe id="frameOfficeLocator" name="frameOfficeLocator"
                title="DPD office locator"
                loading="lazy"
                style="margin-top:10px; width:100%; height:300px; border:0; visibility:hidden;"
                src="${iframeSrc}"></iframe>
      </div>

      <!-- Hidden mirrors, if you still read these in classic code paths -->
      <input type="hidden" id="billing_pickup"  name="billing_pickup"  value="${dpdroLast.id}">
      <input type="hidden" id="shipping_pickup" name="shipping_pickup" value="${dpdroLast.id}">
      <input type="hidden" id="billing_pickup_type" class="js-dpdro-offices-type"
             name="billing_pickup_type" value="${dpdroLast.type}">
    `;
    }

    // Insert our block after the Shipping "pickup_name" field; hide Billing copies.
    function injectOnce() {

        if (dpdRoGeneral.mapEnabled == '0') {
            return;
        }

        injectStylesOnce();

        const wrapper  = q('.wc-block-components-address-form-wrapper');
        if (!wrapper) return false;

        const shipping = q('#shipping.wc-block-components-address-form', wrapper);
        if (!shipping) return false;

        const billing = q('#billing.wc-block-components-address-form', wrapper);
        if (billing) {
            hideWrapperByInput(q('input[data-dpdro="pickup-name"]', billing));
            hideWrapperByInput(q('input[data-dpdro="pickup-id"]',   billing));
            hideWrapperByInput(q('input[data-dpdro="pickup-type"]', billing));
        }

        // Our three address-location fields rendered by Woo in the SHIPPING group.
        const shipNameInput = q('input[data-dpdro="pickup-name"]', shipping);
        const shipIdInput   = q('input[data-dpdro="pickup-id"]',   shipping);
        const shipTypeInput = q('input[data-dpdro="pickup-type"]', shipping);
        if (!shipNameInput) return false;

        // Hide the raw inputs/labels so we show only our custom UI.
        hideWrapperByInput(shipIdInput);
        hideWrapperByInput(shipTypeInput);

        const nameWrapper = shipNameInput.closest('.wc-block-components-text-input');
        const fieldWrapper = getFieldWrapper(shipNameInput, shipping) || nameWrapper;
        if (!fieldWrapper) return false;

        // Resolve to the direct child of the form grid so grid-column spanning works correctly
        // regardless of whether the country has a state field or not.
        let gridCell = fieldWrapper;
        while (gridCell && gridCell.parentElement !== shipping) {
            gridCell = gridCell.parentElement;
        }
        if (!gridCell || gridCell.parentElement !== shipping) {
            gridCell = fieldWrapper; // fallback
        }
        const anchor = ensureMapSpacer(shipping, gridCell);

        // If already injected, just ensure values are synced and positioned as a standalone grid item.
        const existingHost = q('.dpdro-offices-map', shipping);
        if (existingHost) {
            const isAlreadyPositioned =
                existingHost.parentNode === shipping &&
                existingHost.previousElementSibling === anchor;

            if (!isAlreadyPositioned) {
                anchor.insertAdjacentElement('afterend', existingHost);
            }
            setApiFields(shipping, dpdroLast);
            const nameEl = existingHost.querySelector('.js-dpdro-offices-name');
            if (nameEl && nameEl.value !== dpdroLast.name) nameEl.value = dpdroLast.name;
            gridCell.style.display = 'none';
            return true;
        }

        // Create and insert our full-width host block.
        const host = document.createElement('div');
        host.className = 'wc-block-components-text-input dpdro-offices-map is-active';
        host.style.gridColumn = '1 / -1';
        host.innerHTML = buildHostHTML();
        anchor.insertAdjacentElement('afterend', host);

        // Hide the original "pickup_name" grid cell to avoid duplicate label and empty half-width slots.
        gridCell.style.display = 'none';

        // Swap loader -> iframe on load.
        const iframe = q('#frameOfficeLocator', host);
        const loader = q('.dpdro-loader', host);
        iframe.addEventListener('load', () => {
            if (loader) loader.remove();
            iframe.style.visibility = 'visible';
        });

        // Seed the API fields so Blocks/Store API capture values.
        setApiFields(shipping, dpdroLast);

        return true;
    }

    // Bind the postMessage handler once (update our state + API fields).
    let messageBound = false;
    function bindMessageOnce() {
        if (messageBound) return;
        messageBound = true;

        const ALLOWED_ORIGINS = ['https://services.dpd.ro', 'http://services.dpd.ro'];

        window.addEventListener('message', (evt) => {
            // If your widget doesn't set a reliable origin, remove this check (less secure).
            if (evt.origin && !ALLOWED_ORIGINS.includes(evt.origin)) return;

            const data = evt.data || {};
            // Adjust this condition to match the widget payload.
            // Expecting: { dpdro: true, id, name, type }
            if (!data || (!data.dpdro && (typeof data.id === 'undefined'))) return;

            dpdroLast = {
                id:   (data.id   ?? '').toString(),
                name: (data.name ?? '').toString(),
                type: (data.type ?? '').toString()
            };

            // Update visible mirrors in our host
            const host = q('.dpdro-offices-map');
            if (host) {
                const nameEl   = q('.js-dpdro-offices-name', host);
                const typeEl   = q('#billing_pickup_type', host);
                const pickupEl = q('#shipping_pickup', host);
                if (nameEl)   nameEl.value = dpdroLast.name;
                if (typeEl)   typeEl.value = dpdroLast.type;
                if (pickupEl) pickupEl.value = dpdroLast.id;
            }

            // Update API inputs inside the SHIPPING address form
            const shipping = q('#shipping.wc-block-components-address-form');
            if (shipping) setApiFields(shipping, dpdroLast);
        });
    }

    // --- boot ------------------------------------------------------------------
    ready(() => {
        bindMessageOnce();

        // Try now…
        injectOnce();

        // …and on re-renders (Blocks re-mounts parts of the form a lot).
        const mo = new MutationObserver(() => { injectOnce(); });
        mo.observe(document.body, { childList: true, subtree: true });

        // If the iframe takes too long, update text subtly.
        setTimeout(() => {
            const loaderTxt = q('.dpdro-loader .dpdro-loader-text');
            const iframe    = q('#frameOfficeLocator');
            if (loaderTxt && iframe && iframe.style.visibility === 'hidden') {
                loaderTxt.textContent = 'Still loading…';
            }
        }, 5000);
    });
})();
