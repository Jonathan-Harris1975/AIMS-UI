const target = new URL('/console/', location.origin);
target.search = location.search;
target.hash = location.hash;
location.replace(target.toString());
