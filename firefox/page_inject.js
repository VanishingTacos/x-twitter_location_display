// This script is injected into the page context to observe fetch() calls
(function () {
  try {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);

      try {
        const url = args[0];
        const options = args[1];

        // Intercept Authorization header
        let headers = options && options.headers ? options.headers : {};

        // Handle case where args[0] is a Request object
        if (args[0] instanceof Request) {
          try {
            // Iterate over headers if possible, or check specific ones
            // Request.headers is a Headers object
            const reqHeaders = args[0].headers;
            if (reqHeaders) {
              if (reqHeaders.get('Authorization')) headers['Authorization'] = reqHeaders.get('Authorization');
              if (reqHeaders.get('authorization')) headers['authorization'] = reqHeaders.get('authorization');
            }
          } catch (e) {
            // console.log('MapChirp: Error reading Request headers', e);
          }
        }

        if (headers) {
          // console.log('MapChirp: Fetch intercepted', url);
          let auth = headers['Authorization'] || headers['authorization'];
          if (auth) {
            // console.log('MapChirp: Token found, sending message');
            window.postMessage({ source: 'x-location-display-page', type: 'token', token: auth }, '*');
          } else {
            // console.log('MapChirp: No Authorization header found', headers);
          }
        } else {
          // console.log('MapChirp: No headers found');
        }

        if (typeof url === 'string' && url.includes('AboutAccountQuery')) {
          const clonedResponse = response.clone();
          clonedResponse.json().then(data => {
            try {
              const username = data?.data?.user_result_by_screen_name?.result?.core?.screen_name;
              const location = data?.data?.user_result_by_screen_name?.result?.about_profile?.account_based_in;
              if (username && location) {
                window.postMessage({ source: 'x-location-display-page', type: 'location', username, location }, '*');
              }
            } catch (e) {
              // ignore
            }
          }).catch(() => {/* ignore json parse errors */ });
        }
      } catch (e) {
        // ignore
      }

      return response;
    };
    // Intercept XHR requests as fallback
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function (...args) {
      this._url = args[1];
      return originalOpen.apply(this, args);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
      if (header && (header.toLowerCase() === 'authorization')) {
        // console.log('MapChirp: XHR Token found', value);
        window.postMessage({ source: 'x-location-display-page', type: 'token', token: value }, '*');
      }
      return originalSetRequestHeader.apply(this, arguments);
    };

  } catch (e) {
    // ignore injection failure
  }
})();
