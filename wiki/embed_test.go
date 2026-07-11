package wiki

import (
	"path/filepath"
	"testing"
)

func TestEmbeddingsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.bin")

	original := map[string][]float32{
		"a": make([]float32, 384),
		"b": make([]float32, 384),
	}
	original["a"][0] = 1.0
	original["a"][383] = -0.5
	original["b"][100] = 0.7

	err := SaveEmbeddings(path, original)
	if err != nil {
		t.Fatal(err)
	}

	loaded, err := LoadEmbeddings(path)
	if err != nil {
		t.Fatal(err)
	}

	if len(loaded) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(loaded))
	}
	if loaded["a"][0] != 1.0 || loaded["a"][383] != -0.5 {
		t.Error("vector a mismatch")
	}
	if loaded["b"][100] != 0.7 {
		t.Error("vector b mismatch")
	}
}

func TestIncrementalEmbed_Merge(t *testing.T) {
	existing := map[string][]float32{
		"old": make([]float32, 384),
	}
	// IncrementalEmbed with empty changed → returns existing unchanged
	result, err := IncrementalEmbed(existing, nil, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(result) != 1 {
		t.Errorf("expected 1, got %d", len(result))
	}
}
