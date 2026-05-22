try {
  let item = { provider: undefined };
  item.provider.split('--');
} catch (e) {
  console.log("TEST 1", e.message);
}

try {
  let item = { provider: null };
  item.provider.split('--');
} catch (e) {
  console.log("TEST 2", e.message);
}

try {
  let item = { provider: ['ytmusic'] };
  item.provider.split('--');
} catch (e) {
  console.log("TEST 3", e.message);
}

try {
  let item = { provider: { split: undefined } };
  item.provider.split('--');
} catch (e) {
  console.log("TEST 4", e.message);
}
