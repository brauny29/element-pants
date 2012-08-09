;(function() {
  'use strict';

  var slice = Array.prototype.slice;
  var styleSheetElement;

  function camelize(string) {
    return string.replace(/-+(.)?/g, function(match, chr) {
      return chr ? chr.toUpperCase() : '';
    });
  }

  function isNode(value) {
    return value && (value.nodeType == 1 || value.nodeType == 3);
  }

  function isString(value) {
    return Object.prototype.toString.call(value) === '[object String]';
  }

  function isUndefined(value) {
    return void(0) === value;
  }

  var proto = (typeof Element != 'undefined') ? Element.prototype : {} ;

  // Check for native `matchesSelector` method:
  var matchesSelector = proto.matchesSelector || proto.webkitMatchesSelector
    || proto.mozMatchesSelector || proto.msMatchesSelector || proto.oMatchesSelector;

  if (!matchesSelector) {
    // No native `matchesSelector` method; create userland alternative:
    matchesSelector = function(selector) {
      var matches = this.parentNode.querySelectorAll(selector);
      return slice.call(matches).indexOf(this) > -1;
    };
  }

  var Extensions = {

    /**
     * Element#hasClass(className) -> Element
     * - className (String): The CSS class name to check for.
     *
     * Checks is the element has the specified class name.
    **/
    hasClass: function(className) {
      var value = this.className;
      return (value.length > 0
        && (value == className || new RegExp("(^|\\s)" + className + "(\\s|$)").test(value)));
    },

    /**
     * Element#addClass(className) -> Element
     * - className (String): The CSS class name to add to the element
     *
     * Adds `className` to the element.
    **/
    addClass: function(className) {
      var element = this;
      className.split(/\s+/g).forEach(function(name) {
        if (!Extensions.hasClass.call(element, name))
          element.className += (element.className ? ' ' : '') + name;
      });
      return this;
    },

    /**
     * Element#removeClass(className) -> Element
     * - className (String): The CSS class name to remove from the element
     *
     * Removes `className` from the element.
    **/
    removeClass: function(className) {
      var result = this.className;
      className.split(/\s+/g).forEach(function(name) {
        result = result.replace(new RegExp("(^|\\s+)" + name + "(\\s+|$)"), ' ');
      });
      this.className = result.trim();
      return this;
    },

    /**
     * Element#toggleClass(className) -> Element
     * - className (String): The CSS class name to toggle on the element
     *
     * Toggles `className` on the element.
    **/
    toggleClass: function(className) {
      return Extensions[
        Extensions.hasClass.call(this, className) ? 'removeClass' : 'addClass'
      ].call(this, className);
    },

    /**
     * Element#getStyle(style) -> String
     * - style (String): The name of the style to get.
     *
     * Gets `style` from the element's computed style.
    **/
    getStyle: function(style) {
      style = style == 'float' ? 'cssFloat' : camelize(style);
      var value = this.style[style];
      if (!value || value == 'auto') {
        var css = this.ownerDocument.defaultView.getComputedStyle(this, null);
        value = css ? css[style] : null;
      }
      if (style == 'opacity') return value ? parseFloat(value) : 1.0;
      return value == 'auto' ? null : value;
    },

    /**
     * Element#setStyle(style) -> Element
     * - style (String): The name of the style to set.
     *
     * Sets `style` on the element's style attribute.
    **/
    setStyle: function(name, value) {
      var styles;

      if (arguments.length == 2) {
        // Two args, name and value given.
        styles = name + ':' + value + ';';

      } else if (arguments.length == 1 && isString(name)) {
        // One arg, and it's a string. Must be string of CSS.
        styles = name;
      }

      var style = this.style;

      if (styles) {
        style.cssText += ';' + styles;
        return this;
      }

      // Single argument which is not a string: must be an object of
      // key/value pairs.
      styles = name;
      for (var property in styles)
        style[
          (property == 'float' || property == 'cssFloat')
            ? (isUndefined(style.styleFloat) ? 'cssFloat' : 'styleFloat')
            : property
        ] = styles[property];

      return this;
    },

    /**
     * Element#hide() -> Element
     *
     * Hides the element.
    **/
    hide: function() {
      if (!styleSheetElement) {
        var document = this.ownerDocument;
        styleSheetElement = document.createElement('style');
        styleSheetElement.setAttribute('type', 'text/css');
        var rule = '[data-dom-hidden] { display:none !important; }';
        if (styleSheetElement.styleSheet) {
          styleSheetElement.styleSheet.cssText = rule;
        } else styleSheetElement.textContent = rule;
        (document.head || document.getElementsByTagName('head')[0] || document.body)
          .appendChild(styleSheetElement)
      }
      this.setAttribute('data-dom-hidden', 'true');
      return this;
    },

    /**
     * Element#show() -> Element
     *
     * Shows the element. The 
    **/
    show: function() {
      this.removeAttribute('data-dom-hidden');
      return this;
    },

    /**
     * Element#find(selector) -> Element
     * - selector (String): CSS Selector
     *
     * Alias of Element#querySelector
    **/
    find: function(selector) {
      return this.querySelector(selector);
    },

    /**
     * Element#findAll(selector) -> NodeList
     * - selector (String): CSS Selector
     *
     * Alias of Element#querySelectorAll
    **/
    findAll: function(selector) {
      return this.querySelectorAll(selector);
    },

    /**
     * Element#on(eventName[, selector], handler) -> Element
     * - eventName (String): DOM Event Name to listen to.
     * - selector (String): Optional CSS Selector.
     * - handler (function|Object): Event handler of object with `handleEvent` method.
     *
     * Provides DOM event observing with optional event delegation when `selector`
     * is provided.
     *
     * Unlike `addEventListener` API, the handler function is bound to the
     * scope of the matched element, so `this` within the handler will refer
     * to the element.
     *
     * NOTE: To prevent memory leaks, always call `Element#off` before removing
     * and element from the dom.
    **/
    on: function(eventName, selector, handler) {
      var scope = this,
          wrappedHandler;

      if (!this.__registry__) {
        // Lazily create the event registry. 
        Object.defineProperty(this, '__registry__', {
          value: [],
          configurable: false, enumerable: false, writable: true
        });
      }

      if (typeof selector != 'undefined' && handler) {
        wrappedHandler = function(event) {
          var match = null;
          if (selector) {
            var current = event.target;
            while(current !== scope && match == null) {
              if (matchesSelector.call(current, selector)) {
                match = current;
              } else {
                current = current.parentNode;
              }
            }
            if (match) (handler.handleEvent || handler).call(match, event);
          }
        };

      } else {

        wrappedHandler = function(event) {
          (selector.handleEvent || selector).call(scope, event);
        };
      }

      this.__registry__.push([eventName, selector, handler, wrappedHandler]);
      this.addEventListener(eventName, wrappedHandler, false);
      return this;
    },

    /**
     * Element#off([eventName], [selector], [handler]) -> Element
     * - eventName (String): DOM Event Name to listen to.
     * - selector (String): Optional CSS Selector.
     * - handler (function|Object): Event handler of object with `handleEvent` method.
     *
     * Removes DOM event observes for the element. When called without,
     * arguments, all event handlers are removed.
    **/
    off: function(eventName, selector, handler) {
      if (!this.__registry__) return this;
      if (typeof selector == 'undefined' && typeof handler == 'undefined') {
        this.__registry__.forEach(function(group) {
          this.removeEventListener(group[0], group[3], false);
        }.bind(this));
        this.__registry__.length = 0;
        return this;
      }

      for (var i=0; i<this.__registry__.length; i++) {
        var group = this.__registry__[i];
        if (group[0] == eventName && group[1] == selector && group[2] == handler) {
          this.removeEventListener(eventName, group[3], false);
          var rest = this.__registry__.slice(i+1);
          this.__registry__.length = i;
          this.__registry__.push.apply(this.__registry__, rest);
          break;
        }
      }

      return this;
    },

    /**
     * Document#create(tag, [attributes], [content]) -> Element
     * - tag (String): Element tag name.
     * - attributes (Object): Optional hash of Element attributes
     * - content (String|Node): Optional content to insert into the new element.
     *
     * Creates a new Element.
     *
     * TODO: Support namespaced tag names and attributes.
    **/
    create: function(name, attributes, content) {
      var element = document.createElement(name);
      var contentIsNode, contentIsString, typeChecked;

      if (attributes) {
        if (!content && ((typeChecked = true, contentIsNode = isNode(attributes)) || (contentIsString = isString(attributes)))) {
          content = attributes;
          attributes = null;
        }
      }

      if (attributes) {
        for (var key in attributes) {
          element.setAttribute(key, attributes[key]);
        }
      }

      if (content) {
        if ((typeChecked && contentIsString) || (!typeChecked && isString(content))) {
          element.innerHTML = content;
        } else if ((typeChecked && contentIsNode) || (!typeChecked && isNode(content))) {
          element.appendChild(content);
        }
      }

      return element;
    },
 
    // Extend NodeList
    // mouseenter/mouseleave
  };

  var Module = {

    /**
     * install([debug]) -> undefined
     * - debug (Boolean): If debug messages should printed when a function is installed on DOM objects.
     *
     * Installs all module functions (except Module.install) on `Element.prototype`.
    **/
    install: function(debug) {
      if (typeof Element == "undefined") {
        if (debug && console) console.log('DOM Additions could not be installed -- no Element object host.');
        return;
      }

      Object.keys(Extensions).forEach(function(method) {
        if (method == 'create') {
          if (!Document.prototype.hasOwnProperty(method)) {
            Object.defineProperty(Document.prototype, method, {
              value: Extensions[method],
              enumerable: false, configurable: true, writable: true
            });
            if (debug && console) console.log("Installed Document#" + method + "()");
          }
        } else if (!Element.prototype.hasOwnProperty(method)) {
          Object.defineProperty(Element.prototype, method, {
            value: Extensions[method],
            enumerable: false, configurable: true, writable: true
          });
          if (debug && console) console.log("Installed Element#" + method + "()");
        }
      });
    }
  };

  // Copy methods over to the Module object.
  Object.keys(Extensions).forEach(function(method) {
    if (method == 'create') {
      Module[method] = Extensions[method];
      return;
    }

    Module[method] = function(element, args) {
      return Extensions[method].apply(element, slice.call(arguments, 1));
    }
  });

  if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
    // RequireJS
    define(function() { return Module; });

  } else if (typeof module == 'object') {
    // CommonJS
    module.exports = Module;

  } else if (typeof window == 'object') {
    // No module system
    Module.install();
  }

}(this));
