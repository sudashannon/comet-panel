package wiki

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
)

type embedInput struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

type embedOutput struct {
	ID     string    `json:"id"`
	Vector []float64 `json:"vector"`
}

// ComputeEmbeddings runs the embed script for all components.
// scriptPath is the absolute path to scripts/embed.ts.
// Returns id -> float32[384] vectors.
func ComputeEmbeddings(components []Component, scriptPath string) (map[string][]float32, error) {
	if len(components) == 0 {
		return map[string][]float32{}, nil
	}
	// Build input: title + first 200 runes of file body
	var input []embedInput
	for _, c := range components {
		text := c.Title
		if body, err := os.ReadFile(c.Path); err == nil {
			runes := []rune(string(body))
			if len(runes) > 200 {
				runes = runes[:200]
			}
			text += " " + string(runes)
		}
		input = append(input, embedInput{ID: c.ID, Text: text})
	}

	inputJSON, err := json.Marshal(input)
	if err != nil {
		return nil, err
	}

	cmd := exec.Command("bun", scriptPath)
	cmd.Stdin = bytes.NewReader(inputJSON)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("embed script failed: %w", err)
	}

	var output []embedOutput
	if err := json.Unmarshal(out, &output); err != nil {
		return nil, fmt.Errorf("embed output parse failed: %w", err)
	}

	result := make(map[string][]float32, len(output))
	for _, o := range output {
		vec := make([]float32, len(o.Vector))
		for i, v := range o.Vector {
			vec[i] = float32(v)
		}
		result[o.ID] = vec
	}
	return result, nil
}

// SaveEmbeddings writes embeddings to binary cache.
// Format: [uint32 count][per entry: uint16 id_len, id bytes, 384*float32]
func SaveEmbeddings(path string, embeddings map[string][]float32) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	if err := binary.Write(f, binary.LittleEndian, uint32(len(embeddings))); err != nil {
		return err
	}
	for id, vec := range embeddings {
		idBytes := []byte(id)
		if err := binary.Write(f, binary.LittleEndian, uint16(len(idBytes))); err != nil {
			return err
		}
		if _, err := f.Write(idBytes); err != nil {
			return err
		}
		for _, v := range vec {
			if err := binary.Write(f, binary.LittleEndian, v); err != nil {
				return err
			}
		}
	}
	return nil
}

// LoadEmbeddings reads the binary cache file.
func LoadEmbeddings(path string) (map[string][]float32, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var count uint32
	if err := binary.Read(f, binary.LittleEndian, &count); err != nil {
		return nil, err
	}

	result := make(map[string][]float32, count)
	for i := uint32(0); i < count; i++ {
		var idLen uint16
		if err := binary.Read(f, binary.LittleEndian, &idLen); err != nil {
			return nil, err
		}
		idBytes := make([]byte, idLen)
		if _, err := f.Read(idBytes); err != nil {
			return nil, err
		}
		vec := make([]float32, 384)
		if err := binary.Read(f, binary.LittleEndian, &vec); err != nil {
			return nil, err
		}
		result[string(idBytes)] = vec
	}
	return result, nil
}

// IncrementalEmbed embeds only changed components and merges into existing.
func IncrementalEmbed(existing map[string][]float32, changed []Component, scriptPath string) (map[string][]float32, error) {
	if len(changed) == 0 {
		return existing, nil
	}
	newVecs, err := ComputeEmbeddings(changed, scriptPath)
	if err != nil {
		return existing, err
	}
	// Merge
	for id, vec := range newVecs {
		existing[id] = vec
	}
	return existing, nil
}
