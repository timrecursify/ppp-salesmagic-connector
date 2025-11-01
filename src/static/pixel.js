export default `/**
 * PPP Tracking Pixel v2.3.1 - Enhanced Attribution System
 * Fixed: duplicate tracking prevention, missing data fields, error handling, script selector robustness
 * All critical and non-critical fixes from PIXEL_CODE_REVIEW.md implemented
 */
(function() {
  'use strict';
  
  // PPP Enhanced Attribution System v2.3.1 loaded
  
  // Configuration
  var config = {
    endpoint: 'https://pixel.salesmagic.us/api/track/track',
    delay: 100,
    allowedDomains: ['preciouspicspro.com', 'www.preciouspicspro.com', 'localhost'],
    debug: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  };
  
  // Simple logger for debugging
  function log(level, message, data) {
    if (config.debug && window.console && window.console[level]) {
      window.console[level]('[PPP Tracker]', message, data || '');
    }
  }
  
  // Cookie utilities
  function getCookie(name) {
    var value = '; ' + document.cookie;
    var parts = value.split('; ' + name + '=');
    return parts.length === 2 ? parts.pop().split(';').shift() : null;
  }
  
  function setCookie(name, value, days) {
    var expires = '';
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = '; expires=' + date.toUTCString();
    }
    // Use SameSite=None; Secure for cross-site tracking if HTTPS
    var sameSite = window.location.protocol === 'https:' ? 'SameSite=None; Secure' : 'SameSite=Lax';
    document.cookie = name + '=' + value + expires + '; path=/; ' + sameSite;
  }
  
  function uuid() {
    var hex = '';
    for (var i = 0; i < 16; i++) {
      hex += Math.floor(Math.random() * 16).toString(16);
    }
    return 'pxl_' + hex;
  }
  
  // Enhanced Attribution Manager
  var attributionManager = {
    getFirstVisitKey: function() {
      var visitorId = getCookie('ppp_visitor');
      return visitorId ? 'ppp_first_utms_' + visitorId : 'ppp_first_utms';
    },
    
    storeFirstVisitUTMs: function(utmData) {
      if (!utmData || Object.keys(utmData).length === 0) return;
      
      var firstVisitKey = this.getFirstVisitKey();
      
      try {
        var existing = localStorage.getItem(firstVisitKey);
        if (!existing) {
          var firstVisitData = Object.assign({}, utmData, {
            first_visit_timestamp: Date.now(),
            first_visit_url: window.location.href
          });
          
          try {
            localStorage.setItem(firstVisitKey, JSON.stringify(firstVisitData));
          } catch (error) {
            sessionStorage.setItem(firstVisitKey, JSON.stringify(firstVisitData));
          }
        }
      } catch (error) {
        log('warn', 'Attribution storage failed', error);
      }
    },
    
    getAttributionData: function() {
      var currentUTMs = this.getCurrentUTMs();
      var firstVisitUTMs = this.getFirstVisitUTMs();
      
      // Include all UTM parameters and click IDs
      return {
        utm_source: currentUTMs.utm_source || (firstVisitUTMs && firstVisitUTMs.utm_source) || null,
        utm_medium: currentUTMs.utm_medium || (firstVisitUTMs && firstVisitUTMs.utm_medium) || null,
        utm_campaign: currentUTMs.utm_campaign || (firstVisitUTMs && firstVisitUTMs.utm_campaign) || null,
        utm_content: currentUTMs.utm_content || (firstVisitUTMs && firstVisitUTMs.utm_content) || null,
        utm_term: currentUTMs.utm_term || (firstVisitUTMs && firstVisitUTMs.utm_term) || null,
        gclid: currentUTMs.gclid || (firstVisitUTMs && firstVisitUTMs.gclid) || null,
        fbclid: currentUTMs.fbclid || (firstVisitUTMs && firstVisitUTMs.fbclid) || null,
        msclkid: currentUTMs.msclkid || (firstVisitUTMs && firstVisitUTMs.msclkid) || null,
        ttclid: currentUTMs.ttclid || (firstVisitUTMs && firstVisitUTMs.ttclid) || null,
        twclid: currentUTMs.twclid || (firstVisitUTMs && firstVisitUTMs.twclid) || null,
        li_fat_id: currentUTMs.li_fat_id || (firstVisitUTMs && firstVisitUTMs.li_fat_id) || null,
        sc_click_id: currentUTMs.sc_click_id || (firstVisitUTMs && firstVisitUTMs.sc_click_id) || null,
        attribution_source: currentUTMs.utm_source ? 'current' : 'first_visit'
      };
    },
    
    getCurrentUTMs: function() {
      var params = {};
      var search = window.location.search.substring(1);
      if (search) {
        var pairs = search.split('&');
        for (var i = 0; i < pairs.length; i++) {
          var pair = pairs[i].split('=');
          if (pair[0]) {
            var key = decodeURIComponent(pair[0]);
            var value = decodeURIComponent(pair[1] || '');
            // Include UTM params and click IDs
            if (key.startsWith('utm_') || 
                ['gclid', 'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id', 'sc_click_id'].indexOf(key) !== -1) {
              params[key] = value;
            }
          }
        }
      }
      return params;
    },
    
    getFirstVisitUTMs: function() {
      try {
        var stored = localStorage.getItem(this.getFirstVisitKey());
        return stored ? JSON.parse(stored) : null;
      } catch (error) {
        return null;
      }
    },
    
    initializeAttribution: function() {
      var currentUTMs = this.getCurrentUTMs();
      if (currentUTMs && Object.keys(currentUTMs).length > 0) {
        this.storeFirstVisitUTMs(currentUTMs);
      }
    }
  };
  
  // Form Data Capture - Store form data on submit, retrieve on thank-you page
  var formManager = {
    getStorageKey: function() {
      var visitorId = getCookie('ppp_visitor');
      return visitorId ? 'ppp_form_' + visitorId : 'ppp_form_temp';
    },
    
    captureFormData: function(form) {
      var formData = {};
      var inputs = form.querySelectorAll('input, textarea, select');
      
      // Only capture first name, last name, and email fields
      var allowedFields = {
        'first_name': ['first_name', 'firstname', 'first-name', 'fname', 'f_name'],
        'last_name': ['last_name', 'lastname', 'last-name', 'lname', 'l_name'],
        'email': ['email', 'mail', 'e-mail', 'email_address', 'emailaddress']
      };
      
      for (var i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        var name = (input.name || input.id || '').toLowerCase().trim();
        var value = input.value;
        
        // Skip empty values, passwords, submit buttons, and textareas (comments)
        if (!name || !value || 
            input.type === 'password' || 
            input.type === 'submit' || 
            input.type === 'button' ||
            input.tagName === 'TEXTAREA') {  // Skip all textareas (comments)
          continue;
        }
        
        // Check if this is an allowed field
        var fieldKey = null;
        for (var allowedKey in allowedFields) {
          if (allowedFields[allowedKey].indexOf(name) !== -1) {
            fieldKey = allowedKey;
            break;
          }
        }
        
        if (fieldKey) {
          formData[fieldKey] = value.trim();
        }
      }
      
      // Only store if we have at least email (required for Pipedrive search)
      if (!formData.email) {
        return; // Don't store if no email
      }
      
      // Store with timestamp
      var storageData = {
        form_data: formData,
        captured_at: Date.now(),
        form_url: window.location.href
      };
      
      try {
        localStorage.setItem(this.getStorageKey(), JSON.stringify(storageData));
      } catch (error) {
        try {
          sessionStorage.setItem(this.getStorageKey(), JSON.stringify(storageData));
        } catch (e) {
          // Storage failed
        }
      }
    },
    
    getStoredFormData: function() {
      try {
        var stored = localStorage.getItem(this.getStorageKey()) || sessionStorage.getItem(this.getStorageKey());
        if (!stored) return null;
        
        var data = JSON.parse(stored);
        
        // Check if data is recent (within last 10 minutes)
        if (Date.now() - data.captured_at > 600000) {
          this.clearFormData();
          return null;
        }
        
        return data.form_data;
      } catch (error) {
        return null;
      }
    },
    
    clearFormData: function() {
      try {
        localStorage.removeItem(this.getStorageKey());
        sessionStorage.removeItem(this.getStorageKey());
      } catch (error) {
        // Ignore
      }
    },
    
    initFormCapture: function() {
      // Find all forms on page and attach submit handlers
      var forms = document.querySelectorAll('form');
      var self = this;
      
      for (var i = 0; i < forms.length; i++) {
        forms[i].addEventListener('submit', function(e) {
          self.captureFormData(e.target);
        });
      }
    }
  };
  
  // Main tracking function
  function track() {
    // Prevent duplicate tracking calls per page load using page-specific key
    var pageKey = window.location.pathname + window.location.search;
    var trackingKey = 'ppp_tracked_' + pageKey;
    
    if (sessionStorage.getItem(trackingKey)) {
      log('debug', 'Already tracked this page load', { page: pageKey });
      return; // Already tracked this page load
    }
    
    // Mark as tracked for this page load
    try {
      sessionStorage.setItem(trackingKey, Date.now().toString());
    } catch (e) {
      // Fallback to in-memory flag if sessionStorage fails
      if (!window._ppp_tracking_sent) {
        window._ppp_tracking_sent = true;
      } else {
        return;
      }
    }
    
    try {
      // Find pixel script tag - handle multiple scripts and dynamic loading
      var script = null;
      var scripts = document.querySelectorAll('script[data-pixel-id]');
      
      // If multiple scripts found, use the one that contains this code or the first one
      if (scripts.length > 0) {
        // Try to find the script tag that contains this exact script
        var currentScript = document.currentScript || 
                           (function() {
                             var scripts = document.getElementsByTagName('script');
                             return scripts[scripts.length - 1];
                           })();
        
        // Prefer the current script if it has data-pixel-id
        if (currentScript && currentScript.hasAttribute('data-pixel-id')) {
          script = currentScript;
        } else {
          // Otherwise use the first script with data-pixel-id
          script = scripts[0];
        }
      }
      
      var pixelId = script ? script.getAttribute('data-pixel-id') : null;
      
      if (!pixelId) {
        log('warn', 'Pixel ID not found');
        return;
      }
      
      var visitorId = getCookie('ppp_visitor');
      if (!visitorId) {
        visitorId = uuid();
        setCookie('ppp_visitor', visitorId, 365);
      }
      
      attributionManager.initializeAttribution();
      var attribution = attributionManager.getAttributionData();
      
      // Check if this is a thank-you page (exact match: /thank-you or /thank-you/)
      var pathname = window.location.pathname;
      var isThankYouPage = pathname === '/thank-you' || pathname === '/thank-you/';
      
      // Get stored form data if on thank-you page
      var formData = null;
      if (isThankYouPage) {
        formData = formManager.getStoredFormData();
        log('debug', 'Thank-you page detected', { hasFormData: !!formData });
      }
      
      // Collect viewport and screen data
      var viewport = {
        width: window.innerWidth || null,
        height: window.innerHeight || null
      };
      
      var screen = {
        width: window.screen ? window.screen.width : null,
        height: window.screen ? window.screen.height : null
      };
      
      var trackingData = Object.assign({
        pixel_id: pixelId,
        visitor_cookie: visitorId,
        page_url: window.location.href,
        referrer_url: document.referrer || null,
        page_title: document.title || null,
        timestamp: new Date().toISOString(),
        event_type: formData ? 'form_submit' : 'pageview',
        form_data: formData,  // Send as object, JSON.stringify will handle it
        viewport: viewport,
        screen: screen
      }, attribution);
      
      log('debug', 'Sending tracking data', { 
        pixel_id: pixelId, 
        event_type: trackingData.event_type,
        has_form_data: !!formData 
      });
      
      // Send tracking data to backend
      if (window.fetch) {
        fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trackingData)
        }).then(function(response) {
          // Check HTTP status code
          if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
          }
          return response.json();
        }).then(function(result) {
          log('debug', 'Tracking successful', { success: result.success, event_id: result.event_id });
          
          // Clear form data after successful tracking
          if (formData && result.success) {
            formManager.clearFormData();
          }
        }).catch(function(error) {
          log('error', 'Tracking failed', { 
            error: error.message || String(error),
            endpoint: config.endpoint 
          });
          
          // Remove tracking flag on error so retry can happen
          try {
            sessionStorage.removeItem(trackingKey);
          } catch (e) {
            if (window._ppp_tracking_sent) {
              delete window._ppp_tracking_sent;
            }
          }
        });
      } else {
        log('warn', 'Fetch API not available');
      }
      
    } catch (error) {
      log('error', 'Tracking error', { 
        error: error.message || String(error),
        stack: error.stack 
      });
      
      // Remove tracking flag on error
      try {
        sessionStorage.removeItem(trackingKey);
      } catch (e) {
        if (window._ppp_tracking_sent) {
          delete window._ppp_tracking_sent;
        }
      }
    }
  }
  
  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      // Initialize form capture
      formManager.initFormCapture();
      // Fire tracking pixel
      setTimeout(track, config.delay);
    });
  } else {
    // Initialize form capture
    formManager.initFormCapture();
    // Fire tracking pixel
    setTimeout(track, config.delay);
  }
  
  // Expose for debugging
  window.PPPTracker = {
    track: track,
    version: '2.3.1',
    attribution: attributionManager,
    formManager: formManager,
    config: config,
    log: log
  };
  
})();`;
