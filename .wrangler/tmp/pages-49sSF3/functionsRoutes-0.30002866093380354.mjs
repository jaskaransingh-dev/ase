import { onRequestGet as __api_waitlist_js_onRequestGet } from "/Users/jaz/Desktop/work-projects/agent exchange/functions/api/waitlist.js"
import { onRequestOptions as __api_waitlist_js_onRequestOptions } from "/Users/jaz/Desktop/work-projects/agent exchange/functions/api/waitlist.js"
import { onRequestPost as __api_waitlist_js_onRequestPost } from "/Users/jaz/Desktop/work-projects/agent exchange/functions/api/waitlist.js"

export const routes = [
    {
      routePath: "/api/waitlist",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_waitlist_js_onRequestGet],
    },
  {
      routePath: "/api/waitlist",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_waitlist_js_onRequestOptions],
    },
  {
      routePath: "/api/waitlist",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_waitlist_js_onRequestPost],
    },
  ]