const { ROUTES } = require('../src/constants/routes');

describe('gateway route map', () => {
  test('every route has a path starting with "/"', () => {
    for (const route of ROUTES) {
      expect(route.path).toMatch(/^\//);
    }
  });

  test('every route targets a valid http(s) URL', () => {
    for (const route of ROUTES) {
      expect(['http:', 'https:']).toContain(new URL(route.target).protocol);
    }
  });

  test('every rewriteTo is empty or starts with "/"', () => {
    for (const route of ROUTES) {
      expect(route.rewriteTo).toMatch(/^(\/.*)?$/);
    }
  });

  test('no two routes share the same path', () => {
    const paths = ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
