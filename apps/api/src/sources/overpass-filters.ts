/**
 * The Overpass QL tag filter for elements whose `key` has one of `values`, or
 * any value if `values` is `null`: `["shop"]`, `["railway"="station"]` or
 * `["amenity"~"^(cafe|pub)$"]`.
 */
export const tagFilter = (key: string, values: readonly string[] | null) => {
  if (values === null) return `["${key}"]`;
  return values.length === 1
    ? `["${key}"="${values.join("")}"]`
    : `["${key}"~"^(${values.join("|")})$"]`;
};

/**
 * The Overpass QL tag filters that find every element some rule matches: one
 * per key, naming the values of that key's rules.
 */
export const ruleFilters = (
  rules: readonly { key: string; values: readonly string[] }[],
) =>
  [...new Set(rules.map(({ key }) => key))].map((key) =>
    tagFilter(
      key,
      rules.filter((rule) => rule.key === key).flatMap(({ values }) => values),
    ),
  );
