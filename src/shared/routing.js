function matchPath(routePath, pathname) {
  if (typeof routePath === 'string') {
    return routePath === pathname ? [] : null;
  }
  const match = pathname.match(routePath);
  return match ? Array.from(match) : null;
}

function defaultParams(match) {
  if (match.length <= 1) return {};
  return { id: decodeURIComponent(match[1]) };
}

export function createRouteGroup(routes) {
  return async function handleRouteGroup(context) {
    for (const route of routes) {
      if (route.method !== context.req.method) continue;

      const match = matchPath(route.path, context.pathname);
      if (!match) continue;

      await route.action({
        ...context,
        params: route.params ? route.params(match) : defaultParams(match)
      });
      return true;
    }

    return false;
  };
}
