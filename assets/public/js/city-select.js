var dpd_city_dropdown = 1;
jQuery(function ($) {
    if (typeof dpd_wc_city_select_params === 'undefined') {
        return false;
    }
    window.isBlocksCheckout =
        document.querySelector('.wc-block-checkout') ||
        document.querySelector('select.wc-blocks-components-select__select') ||
        document.querySelector('#shipping-country, #billing-country');


    // Select2 Enhancement if it exists
    if ($().selectWoo) {
        var getEnhancedSelectFormatString = function () {
            return {
                'language': {
                    errorLoading: function () {
                        // Workaround for https://github.com/select2/select2/issues/4355 instead of i18n_ajax_error.
                        return wc_country_select_params.i18n_searching;
                    },
                    inputTooLong: function (args) {
                        var overChars = args.input.length - args.maximum;

                        if (1 === overChars) {
                            return wc_country_select_params.i18n_input_too_long_1;
                        }
                        return wc_country_select_params.i18n_input_too_long_n.replace('%qty%', overChars);
                    },
                    inputTooShort: function (args) {
                        var remainingChars = args.minimum - args.input.length;

                        if (1 === remainingChars) {
                            return wc_country_select_params.i18n_input_too_short_1;
                        }
                        return wc_country_select_params.i18n_input_too_short_n.replace('%qty%', remainingChars);
                    },
                    loadingMore: function () {
                        return wc_country_select_params.i18n_load_more;
                    },
                    maximumSelected: function (args) {
                        if (args.maximum === 1) {
                            return wc_country_select_params.i18n_selection_too_long_1;
                        }
                        return wc_country_select_params.i18n_selection_too_long_n.replace('%qty%', args.maximum);
                    },
                    noResults: function () {
                        return wc_country_select_params.i18n_no_matches;
                    },
                    searching: function () {
                        return wc_country_select_params.i18n_searching;
                    }
                }
            };
        };

        var wc_city_select_select2 = function () {
            $('select.city_select:visible').each(function () {
                var select2_args = $.extend({
                    placeholder: $(this).attr('data-placeholder') || $(this).attr('placeholder') || '',
                    width: '100%'
                }, getEnhancedSelectFormatString());

                $(this)
                    .on('select2:select', function () {
                        $(this).focus(); // Maintain focus after select https://github.com/select2/select2/issues/4384
                    })
                    .selectWoo(select2_args);
            });
        };

        wc_city_select_select2();

        $(document.body).bind('city_to_select', function () {
            wc_city_select_select2();
        });
    }


    /* City select boxes */
    $(document.body).on('country_to_state_changing', function (e, country, $container) {
        var $statebox = $container.find('#billing_state, #shipping_state, #calc_shipping_state'),
            state = $statebox.val();
        $(document.body).trigger('state_changing', [country, state, $container]);
    });

    $(document.body).on('change', 'select.state_select, #calc_shipping_state', function () {
        var $container = $(this).closest('.form-row').parent(),
            country = $container.find('#billing_country, #shipping_country, #calc_shipping_country').val(),
            state = $(this).val();

        $(document.body).trigger('state_changing', [country, state, $container]);
    });

    //classic
    $(document.body).on('state_changing', function (e, country, state, $container) {
        var $citybox = $container.find('#billing_city, #shipping_city, #calc_shipping_city');

        if (dpd_wc_city_select_params.cities[country] && country == 'RO') {
            /* if the country has no states */
            if (state) {
                if (dpd_wc_city_select_params.cities[country][state]) {
                    console.log("c1");
                    cityToSelect($citybox, dpd_wc_city_select_params.cities[country][state]);
                } else {
                    cityToInput($citybox);
                }
            } else {
                disableCity($citybox);
            }
        } else {
            cityToInput($citybox);
        }
    });


    function onStateChangingBlocks(handler) {
        function getStepFromEl($el) {
            const id = (($el && $el.attr('id')) || '').toLowerCase();
            if (id.indexOf('billing-') === 0) return 'billing';
            if (id.indexOf('shipping-') === 0 || id.indexOf('calc-shipping-') === 0) return 'shipping';
            return 'shipping';
        }

        function runNow($scope) {
            const step = getStepFromEl($scope);
            const $container = ($scope && $scope.closest('form').length) ? $scope.closest('form') : $(document);

            const countrySel = step === 'billing'
                ? '#billing-country'
                : '#shipping-country, #calc-shipping-country';
            const stateSel = step === 'billing'
                ? '#billing-state'
                : '#shipping-state, #calc-shipping-state';
            const citySel = step === 'billing'
                ? '#billing-city'
                : '#shipping-city, #calc-shipping-city';

            const country =
                ($container.find(countrySel).first().val() || $(countrySel).first().val() || '').toString();

            const state =
                ($container.find(stateSel).first().val() || $(stateSel).first().val() || '').toString();

            const $citybox = $container.find(citySel).first().length
                ? $container.find(citySel).first()
                : $(citySel).first();

            if (!$citybox.length) return;

            handler(step, country, state, $citybox, $container);
        }

        function bind() {
            const sel =
                '#billing-country, #shipping-country, #calc-shipping-country,' +
                '#billing-state, #shipping-state, #calc-shipping-state';

            $(document).find(sel).each(function () {
                const $el = $(this);
                if ($el.data('dpdBound')) return;
                $el.data('dpdBound', true);

                $el.on('change.dpd', function () {
                    runNow($el);
                });

                // Billing fields can be re-mounted in Blocks when toggling "use same address".
                runNow($el);
                setTimeout(function () {
                    runNow($el);
                }, 150);
            });
        }

        bind();
        new MutationObserver(bind).observe(document.body, { childList: true, subtree: true });

        // ✅ trigger once on initial load (after fields exist)
        // If fields are not yet present, MutationObserver will bind later — so we retry until found.
        const t = setInterval(() => {
            const $any = $('#billing-country, #shipping-country, #billing-state, #shipping-state');
            if ($any.length) {
                clearInterval(t);
                $any.each(function () {
                    runNow($(this));
                });
            }
        }, 100);
    }


    onStateChangingBlocks(function (step, country, state, $citybox) {
        console.log("Blocks city triggered", step, country, state);
        if (dpd_wc_city_select_params.cities[country] && country == 'RO') {
            /* if the country has no states */
            if (state) {
                if (dpd_wc_city_select_params.cities[country][state]) {
                    cityToSelect($citybox, dpd_wc_city_select_params.cities[country][state]);
                } else {
                    cityToInput($citybox);
                }
            } else {
                disableCity($citybox);
            }
        } else {
            cityToInput($citybox);
        }
    });


    $(document.body).on('change', 'select.city_select', function () {
        var $container = $(this).closest('.form-row').parent();

        // detect step (shipping vs billing)
        let step = 'billing';
        const id = ($(this).attr('id') || '').toLowerCase();
        const name = ($(this).attr('name') || '').toLowerCase();

        if (
            id.startsWith('shipping') ||
            name.startsWith('shipping') ||
            $(this).closest('.wc-block-components-shipping-address').length
        ) {
            step = 'shipping';
        }

        // Read postcode from the changed city select first (most reliable source).
        let postcode = (($(this).find(':selected').attr('data-postcode')) ?? '').toString().trim();

        // Fallback to the same step's city select only (avoid cross-step leakage).
        if (!postcode) {
            const stepCitySelector = window.isBlocksCheckout
                ? (step === 'shipping' ? '#shipping-city' : '#billing-city')
                : (step === 'shipping' ? '#shipping_city' : '#billing_city');
            postcode = (($(stepCitySelector).find(':selected').attr('data-postcode')) ?? '').toString().trim();
        }

        console.log("City changed, step=", step, "postcode=", postcode);

        if (postcode !== '') {
            $container.find('#billing_postcode, #shipping_postcode, #calc_shipping_postcode').val(postcode);

            if (window.isBlocksCheckout) {
                const nextPc = String(postcode ?? '').trim();
                const expectedPc = String((((window.dpdExpectedPostcodes || {})[step]) ?? '')).trim();
                const suppressUntil = window.dpdProgrammaticPostcodeUntil || 0;
                const inProgrammaticWindow = Date.now() < suppressUntil;

                console.log("nextPc", nextPc);
                console.log("expectedPc", expectedPc);
                console.log("suppressUntil", suppressUntil);
                console.log("inProgrammaticWindow", inProgrammaticWindow);

                if (inProgrammaticWindow && expectedPc && nextPc && nextPc !== expectedPc) {
                    console.log('[DPD][DBG] city-select ignoring stale postcode during programmatic window', {
                        step: step,
                        emitted: nextPc,
                        expected: expectedPc
                    });
                    postcode = expectedPc;
                }

                if (typeof reloadWidget === "function") {
                    console.log('[DPD][DBG] blocks city change: deferring postcode write to reloadWidget', {
                        step: step,
                        postcode: postcode
                    });
                } else {
                    setPostcode(step, nextPc);
                }

                var newCityValue = $(this).find('option:selected').val() || $(this).val();
                $(this).trigger('city_select_changed', [newCityValue, postcode]);

                return;
            }

            $('#billing-postcode, #shipping-postcode, #calc-shipping-postcode').val(postcode);
            $('#billing-postcode, #shipping-postcode, #calc-shipping-postcode')
                .val(postcode)
                .trigger('input')
                .trigger('change');
            //setBlocksPostalCode2(postcode);
        } else {
            $container.find('#billing_postcode, #shipping_postcode, #calc_shipping_postcode').val('');

            if (window.isBlocksCheckout) {
                // Sync city (and empty postcode) to WC store — needed when custom.js is absent
                if (typeof reloadWidget !== "function") {
                    setPostcode(step, '');
                }
                // Trigger custom change event to notify custom.js handlers with the new city value
                var newCityValue = $(this).find('option:selected').val() || $(this).val();
                console.log("Triggering city_select_changed with city:", newCityValue);
                $(this).trigger('city_select_changed', [newCityValue, '']);
                return;
            }

            $('#billing-postcode, #shipping-postcode, #calc-shipping-postcode').val('');
            $('#billing-postcode, #shipping-postcode, #calc-shipping-postcode')
                .val('')
                .trigger('input')
                .trigger('change');
            //setBlocksPostalCode2('');
        }
    });

    // blocks for city - custom event from city-select.js
    // Bind once to avoid duplicate reloadWidget calls per step iteration.
    $(document)
        .off('city_select_changed.dpdro_city', 'select.city_select')
        .on('city_select_changed.dpdro_city', 'select.city_select', function (event, newCityValue, newPostcode) {
            const el = this;
            const id = (el.id || '').toLowerCase();
            const name = (el.name || '').toLowerCase();
            let step =
                id.startsWith('shipping') || name.startsWith('shipping') ||
                $(el).closest('[data-block-name*="shipping"]').length ||
                $(el).closest('.wc-block-components-shipping-address').length
                    ? 'shipping'
                    : 'billing';

            console.log("City select changed - reloading widget with step:", step, "city:", newCityValue, "postcode:", newPostcode);

            $('[id="' + step + '-pickup"]').val(null).trigger('change');
            $('.js-dpdro-offices-name').val(dpdRoGeneral.textNoOfficeSelected);
            $('.js-dpdro-offices-type').val('');

            if (window.isBlocksCheckout && typeof window.setBlocksCityEverywhere === 'function') {
                window.setBlocksCityEverywhere(step, newCityValue || '');
            }

            var cityWrapper = {
                val: function () {
                    return newCityValue || '';
                }
            };

            // call immediately (no need to wait for store)
            if (typeof reloadWidget === "function") {
                reloadWidget(step, cityWrapper, newPostcode || '');
            }
        });

    /* Ajax replaces .cart_totals (child of .cart-collaterals) on shipping calculator */
    if ($('.cart-collaterals').length && $('#calc_shipping_state').length) {
        var calc_observer = new MutationObserver(function () {
            $('#calc_shipping_state').change();
        });
        calc_observer.observe(document.querySelector('.cart-collaterals'), { childList: true });
    }

    function setPostcode(step, postcode) {
        if (!window.wp?.data?.dispatch) return false;

        console.log('[DPD] setPostcode()', step, postcode);

        const { cartSelect, cartDispatch } = getStores2();
        if (!cartSelect || !cartDispatch) return false;

        const customer = cartSelect?.getCustomerData?.() || {};
        const shipping = customer.shippingAddress || {};
        const billing = customer.billingAddress || {};

        const city = $('[id=' + step + '-city]').val() || '';
        const pc = String(postcode ?? '');

        if (step === 'shipping') {
            const nextShipping = { ...shipping, postcode: pc, city: city };
            cartDispatch?.setShippingAddress?.(nextShipping);

            const mirrorToBilling = $('.wc-block-checkout__use-address-for-billing input[type="checkbox"]:checked').length > 0;
            const updateData = { shippingAddress: nextShipping };
            if (mirrorToBilling) {
                const nextBilling = { ...billing, postcode: pc, city: city };
                cartDispatch?.setBillingAddress?.(nextBilling);
                updateData.billingAddress = nextBilling;
            }

            console.log('[DPD] setPostcode updating', updateData);
            return cartDispatch?.updateCustomerData?.(updateData, false);
        } else {
            const nextBilling = { ...billing, postcode: pc, city: city };
            cartDispatch?.setBillingAddress?.(nextBilling);

            console.log('[DPD] setPostcode updating billing', nextBilling);
            return cartDispatch?.updateCustomerData?.({ billingAddress: nextBilling }, false);
        }
    }

    function getStores2() {
        if (!window.wp?.data?.select || !window.wp?.data?.dispatch) {
            return { cartSelect: null, cartDispatch: null, checkoutSelect: null };
        }
        return {
            cartSelect: window.wp.data.select('wc/store/cart') || null,
            cartDispatch: window.wp.data.dispatch('wc/store/cart') || null,
            checkoutSelect: window.wp.data.select('wc/store/checkout') || null,
        };
    }

    function cityToInput($citybox) {
        if ($citybox.is('input')) {
            $citybox.prop('disabled', false);
            return;
        }

        var input_name = $citybox.attr('name'),
            input_id = $citybox.attr('id'),
            placeholder = $citybox.attr('placeholder'),
            $newcity = $('<input type="text" />')
                .prop('id', input_id)
                .prop('name', input_name)
                .prop('placeholder', placeholder)
                .addClass('input-text');

        $citybox.parent().find('.select2-container').remove();
        $citybox.replaceWith($newcity);



    }

    function disableCity($citybox) {
        $citybox.val('').change();
        $citybox.prop('disabled', true);
    }

    function makeSelectLookLikeBlocks($select) {
        const $ref = jQuery('#shipping-state, #billing-state').first(); // existing Blocks select
        if (!$ref.length) return;

        // Copy class attribute (and keep your city_select class)
        $select.attr('class', ($ref.attr('class') || '') + ' city_select');

        // Copy common ARIA/UX attrs
        ['aria-invalid', 'aria-required'].forEach(a => {
            const v = $ref.attr(a);
            if (typeof v !== 'undefined') $select.attr(a, v);
        });

        // City autocomplete
        $select.attr({ autocomplete: 'address-level2', size: 1 });
    }



    function cityToSelect($citybox, current_cities) {

        cityLoaded = true;
        var value = $citybox.val();
        if ($citybox.is('input')) {
            var input_name = $citybox.attr('name'),
                input_id = $citybox.attr('id'),
                placeholder = $citybox.attr('placeholder'),
                $newcity = $('<select></select>')
                    .prop('id', input_id)
                    .prop('name', input_name)
                    .data('placeholder', placeholder)
                    .addClass('city_select')
                    .addClass('wc-blocks-components-select__select')
                    .attr({
                        'aria-invalid': 'false',
                        'autocomplete': 'address-level1',
                        'size': 1
                    });

            $citybox.replaceWith($newcity);
            $citybox = $('#' + input_id);
        } else {
            $citybox.prop('disabled', false);
        }

        var $defaultOption = $('<option></option>')
            .attr('value', '')
            .text(dpd_wc_city_select_params.i18n_select_city_text);
        $citybox.empty().append($defaultOption);

        for (var index in current_cities) {
            if (current_cities.hasOwnProperty(index)) {
                var $option = $('<option></option>');
                if (current_cities[index] instanceof Array) {
                    var cityName = current_cities[index][0];
                    $option.attr('data-postcode', current_cities[index][1]);
                } else {
                    var cityName = current_cities[index];
                }
                $option.prop('value', cityName)
                    .text(cityName);
                $citybox.append($option);
            }
        }

        if ($('option[value="' + value + '"]', $citybox).length) {
            $citybox.val(value);
        } else {
            $citybox.val('');
        }

        // In Blocks, avoid synthetic change when rebuilding options: it can re-emit stale postcode.
        if (!window.isBlocksCheckout) {
            $citybox.change();
        }

        const $main = $citybox.closest('.wc-block-components-address-form__city');
        if (!$main.length) {
            return;
        }

        const $label = $main.find('label[for="' +input_id + '"]');

        // Avoid double-wrapping
        if ($main.children('.dpd-city-wrapper').length) return;

        // Create the wrappers
        const $div1 = $('<div class="wc-blocks-components-select"></div>');
        const $div2 = $('<div class="wc-blocks-components-select__container"></div>');

        // Insert structure
        $div2.append($label, $citybox);
        $div1.append($div2);

        // Clear main and re-append
        $main.empty().append($div1);

        $(document.body).trigger('city_to_select');

    }

});
