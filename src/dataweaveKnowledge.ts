export interface DataWeaveFunctionInfo {
  name: string;
  signature: string;
  category: 'Core / Collection' | 'String' | 'Object' | 'Array' | 'Type Conversion' | 'Utility' | 'Logical';
  description: string;
  plainEnglishExplanation: string;
  example: string;
  docsUrl: string;
}

export const DATAWEAVE_FUNCTIONS: Record<string, DataWeaveFunctionInfo> = {
  map: {
    name: 'map',
    signature: 'Array<T> map ((item: T, index: Number) -> R): Array<R>',
    category: 'Array',
    description: 'Iterates through each element of an Array and transforms each element into a new representation.',
    plainEnglishExplanation: 'Takes every single item in the array one by one, applies your transformation, and gives back a new array with the transformed items.',
    example: 'payload.orders map (order, index) -> {\n  id: order.id,\n  total: order.amount\n}',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-map'
  },
  filter: {
    name: 'filter',
    signature: 'Array<T> filter ((item: T, index: Number) -> Boolean): Array<T>',
    category: 'Array',
    description: 'Returns only the items in an Array that satisfy the conditional boolean expression.',
    plainEnglishExplanation: 'Checks every item in the list against your condition. Only items that evaluate to true are kept; all others are discarded.',
    example: 'payload filter (item) -> item.status == "ACTIVE"',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-filter'
  },
  reduce: {
    name: 'reduce',
    signature: 'Array<T> reduce ((item: T, accumulator: R) -> R): R',
    category: 'Array',
    description: 'Applies a binary function to each item in an Array, accumulating all values into a single final value.',
    plainEnglishExplanation: 'Combines or calculates all elements of an array into a single result (e.g. summing total amounts, aggregating scores).',
    example: 'payload.items reduce (item, total = 0) -> total + item.price',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-reduce'
  },
  groupBy: {
    name: 'groupBy',
    signature: 'Array<T> groupBy ((item: T, index: Number) -> K): Object<K, Array<T>>',
    category: 'Array',
    description: 'Groups elements from an Array based on the criteria evaluated by the lambda expression.',
    plainEnglishExplanation: 'Organizes an array into a key-value object where each key is a category or grouping criteria, and the value is the list of matching items.',
    example: 'payload.orders groupBy (order) -> order.status',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-groupby'
  },
  orderBy: {
    name: 'orderBy',
    signature: 'Array<T> orderBy ((item: T) -> Comparable): Array<T>',
    category: 'Array',
    description: 'Sorts elements of an Array in ascending order based on the value returned by the lambda.',
    plainEnglishExplanation: 'Sorts the entire list based on the field or expression you specify (e.g. earliest date, lowest to highest price).',
    example: 'payload.users orderBy (u) -> u.lastName',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-orderby'
  },
  distinctBy: {
    name: 'distinctBy',
    signature: 'Array<T> distinctBy ((item: T, index: Number) -> Any): Array<T>',
    category: 'Array',
    description: 'Returns an Array with duplicate elements removed based on the key returned by the expression.',
    plainEnglishExplanation: 'Removes all duplicate records from a list, keeping only the first unique occurrence of each specified key (e.g. unique customer IDs).',
    example: 'payload distinctBy (item) -> item.customerId',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-distinctby'
  },
  flatMap: {
    name: 'flatMap',
    signature: 'Array<T> flatMap ((item: T, index: Number) -> Array<R>): Array<R>',
    category: 'Array',
    description: 'Maps each element to a collection and flattens all nested collections into a single top-level Array.',
    plainEnglishExplanation: 'Transforms each item into an array of sub-items and automatically merges them into one single flat array.',
    example: 'payload.orders flatMap (o) -> o.lineItems',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-flatmap'
  },
  pluck: {
    name: 'pluck',
    signature: 'Object pluck ((value: Any, key: Key, index: Number) -> R): Array<R>',
    category: 'Object',
    description: 'Converts an Object into an Array by extracting keys, values, or indices into a list.',
    plainEnglishExplanation: 'Takes a key-value object and turns each entry into an item in a list (e.g. extracting all values from a map into an array).',
    example: 'payload pluck (val, key) -> { property: key, data: val }',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-pluck'
  },
  mapObject: {
    name: 'mapObject',
    signature: 'Object mapObject ((value: Any, key: Key, index: Number) -> Object): Object',
    category: 'Object',
    description: 'Iterates through each key-value pair of an Object and constructs a newly transformed Object.',
    plainEnglishExplanation: 'Loops over every key and value in an object, letting you rename keys, reformat values, or filter properties dynamically.',
    example: 'payload mapObject (val, key) -> {\n  (upper(key)): val\n}',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-mapobject'
  },
  filterObject: {
    name: 'filterObject',
    signature: 'Object filterObject ((value: Any, key: Key, index: Number) -> Boolean): Object',
    category: 'Object',
    description: 'Filters the key-value pairs of an Object, returning only pairs that satisfy the boolean condition.',
    plainEnglishExplanation: 'Strips out keys from an object if their value does not meet your condition (e.g. removing null or empty fields).',
    example: 'payload filterObject (value, key) -> value != null and value != ""',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-filterobject'
  },
  sizeOf: {
    name: 'sizeOf',
    signature: 'sizeOf(value: Array | Object | String | Binary): Number',
    category: 'Core / Collection',
    description: 'Returns the number of elements in an Array, key-value pairs in an Object, or characters in a String.',
    plainEnglishExplanation: 'Counts how many items are in a list, how many keys are in an object, or how many characters are in a text string.',
    example: 'sizeOf(payload.items)',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-sizeof'
  },
  isEmpty: {
    name: 'isEmpty',
    signature: 'isEmpty(value: Any): Boolean',
    category: 'Core / Collection',
    description: 'Returns true if the specified value is null, an empty string, an empty array, or an empty object.',
    plainEnglishExplanation: 'Safely checks if something has nothing inside it (null, "", [], or {}), avoiding null pointer errors.',
    example: 'if (isEmpty(payload.customer)) "No Customer" else payload.customer.name',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-isempty'
  },
  now: {
    name: 'now',
    signature: 'now(): DateTime',
    category: 'Utility',
    description: 'Returns a DateTime object representing the current system date and time with timezone.',
    plainEnglishExplanation: 'Gets the current live timestamp right now when this transformation runs.',
    example: 'timestamp: now() as String {format: "yyyy-MM-dd HH:mm:ss"}',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-now'
  },
  uuid: {
    name: 'uuid',
    signature: 'uuid(): String',
    category: 'Utility',
    description: 'Generates a random v4 universally unique identifier (UUID) as a String.',
    plainEnglishExplanation: 'Generates a fresh, unique random identifier (e.g. "e2d53bf3-86b2-4d2c-806f-6f91667b2d56") ideal for transaction or correlation IDs.',
    example: 'transactionId: uuid()',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-uuid'
  },
  contains: {
    name: 'contains',
    signature: 'contains(target: Array | String, search: Any): Boolean',
    category: 'String',
    description: 'Returns true if a String contains a substring, or an Array contains a matching element.',
    plainEnglishExplanation: 'Checks if a word is inside a text sentence, or if an item is already inside an array list.',
    example: 'payload.roles contains "ADMIN"',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-contains'
  },
  startsWith: {
    name: 'startsWith',
    signature: 'startsWith(text: String, prefix: String): Boolean',
    category: 'String',
    description: 'Returns true if the String begins with the specified prefix substring.',
    plainEnglishExplanation: 'Checks if text begins with a given prefix (e.g. startsWith(accountNo, "ACC-")).',
    example: 'payload.accountId startsWith "ACT-"',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-startswith'
  },
  endsWith: {
    name: 'endsWith',
    signature: 'endsWith(text: String, suffix: String): Boolean',
    category: 'String',
    description: 'Returns true if the String ends with the specified suffix substring.',
    plainEnglishExplanation: 'Checks if text finishes with a specific suffix (e.g. checking file extensions like ".csv").',
    example: 'payload.fileName endsWith ".json"',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-endswith'
  },
  splitBy: {
    name: 'splitBy',
    signature: 'splitBy(text: String, separator: Regex | String): Array<String>',
    category: 'String',
    description: 'Splits a String into an Array of substrings separated by a delimiter or regular expression.',
    plainEnglishExplanation: 'Cuts a string into multiple pieces wherever the delimiter occurs (e.g. splitting a comma-separated list into an array).',
    example: '"apple,banana,cherry" splitBy ","',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-splitby'
  },
  joinBy: {
    name: 'joinBy',
    signature: 'joinBy(items: Array<Any>, separator: String): String',
    category: 'String',
    description: 'Concatenates elements of an Array into a single String, separated by the specified delimiter.',
    plainEnglishExplanation: 'Glues an array of words together into a single string with a separator between each (e.g. ["a", "b"] joined by ", " -> "a, b").',
    example: 'payload.tags joinBy ", "',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-joinby'
  },
  upper: {
    name: 'upper',
    signature: 'upper(text: String): String',
    category: 'String',
    description: 'Converts all characters in the String to uppercase.',
    plainEnglishExplanation: 'Converts text entirely to CAPITAL LETTERS.',
    example: 'upper("mulesoft") // "MULESOFT"',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-upper'
  },
  lower: {
    name: 'lower',
    signature: 'lower(text: String): String',
    category: 'String',
    description: 'Converts all characters in the String to lowercase.',
    plainEnglishExplanation: 'Converts text entirely to small lowercase letters.',
    example: 'lower("MULESOFT") // "mulesoft"',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-lower'
  },
  trim: {
    name: 'trim',
    signature: 'trim(text: String): String',
    category: 'String',
    description: 'Removes leading and trailing whitespace from the String.',
    plainEnglishExplanation: 'Strips unwanted spaces from the beginning and end of a text string.',
    example: 'trim("  hello world  ") // "hello world"',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-trim'
  },
  replace: {
    name: 'replace',
    signature: 'replace(text: String, target: Regex | String) with (replacement: String): String',
    category: 'String',
    description: 'Replaces all occurrences of a substring or matching regex with a new replacement String.',
    plainEnglishExplanation: 'Finds words or characters in text and swaps them out with your replacement.',
    example: '"hello 123" replace /[0-9]+/ with "world"',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-replace'
  },
  flatten: {
    name: 'flatten',
    signature: 'flatten(items: Array<Array<T>>): Array<T>',
    category: 'Array',
    description: 'Flattens an Array of nested Arrays into a single one-dimensional Array.',
    plainEnglishExplanation: 'Collapses nested arrays like [[1, 2], [3, 4]] into one clean single array [1, 2, 3, 4].',
    example: 'flatten([[1, 2], [3, 4]])',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-flatten'
  },
  log: {
    name: 'log',
    signature: 'log(prefix: String, value: T): T',
    category: 'Utility',
    description: 'Logs the prefix and value to the application console while returning the value unchanged.',
    plainEnglishExplanation: 'Prints debug output to the console during transformation without interrupting or changing the data flow.',
    example: 'log("Order processing", payload.orderId)',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-log'
  },
  typeOf: {
    name: 'typeOf',
    signature: 'typeOf(value: Any): Type',
    category: 'Type Conversion',
    description: 'Returns the DataWeave Type of the evaluated expression (e.g. String, Number, Array, Object).',
    plainEnglishExplanation: 'Tells you what kind of data something is (String, Number, Boolean, Object, Array, etc.).',
    example: 'typeOf(payload) == "Array"',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-typeof'
  },
  p: {
    name: 'p',
    signature: 'p(propertyName: String): String',
    category: 'Utility',
    description: 'Reads an application configuration property by key from active property files or system properties.',
    plainEnglishExplanation: 'Retrieves an environment configuration value (e.g. host, port, timeout) from your yaml or properties file.',
    example: 'p("secure::db.password")',
    docsUrl: 'https://docs.mulesoft.com/dataweave/latest/dw-core-functions-p'
  }
};
