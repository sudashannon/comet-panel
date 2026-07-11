import { embed } from '@ternlight/base'

const input: { id: string; text: string }[] = JSON.parse(await Bun.stdin.text())
const results: { id: string; vector: number[] }[] = []

for (const item of input) {
  // embed() is documented as sync, but `await` handles it either way
  // in case a future version returns a promise.
  const vec = await embed(item.text)
  results.push({ id: item.id, vector: Array.from(vec) })
}

console.log(JSON.stringify(results))
