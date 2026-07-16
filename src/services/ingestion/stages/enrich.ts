import type { ParserResult, SemanticChunk } from "@/services/parser/types";
import type { IngestionJob } from "../types";

export interface EnrichedDocument {
  parsed: ParserResult;
  blocks: ParserResult["blocks"];
  toc: ParserResult["toc"];
  searchableText: string;
  semanticChunks: SemanticChunk[];
  warnings: string[];
  confidence: number;
}

function assignSemanticChunkIds(
  blocks: ParserResult["blocks"]
): ParserResult["blocks"] {
  let currentChunk = 0;
  return blocks.map((block, _index) => {
    if (block.type === "heading" || block.type === "subheading") {
      currentChunk += 1;
    }
    return {
      ...block,
      semanticChunkId: `chunk-${currentChunk || 1}`,
    };
  });
}

export function enrichParsedDocument(
  normalized: {
    parsed: ParserResult;
    blocks: ParserResult["blocks"];
    toc: ParserResult["toc"];
    searchableText: string;
  },
  job: IngestionJob
): EnrichedDocument {
  const blocks = assignSemanticChunkIds(normalized.blocks);
  const chunkMap = new Map<string, SemanticChunk>();

  for (const block of blocks) {
    const chunkId = block.semanticChunkId ?? "chunk-1";
    if (!chunkMap.has(chunkId)) {
      chunkMap.set(chunkId, {
        id: chunkId,
        title: block.type === "heading" ? String(block.content) : undefined,
        text: "",
        blockIds: [],
        metadata: { source: job.sourceType, parserType: job.parserType },
      });
    }
    const chunk = chunkMap.get(chunkId)!;
    chunk.blockIds.push(block.id ?? "");
    chunk.text += ` ${
      typeof block.content === "string"
        ? block.content
        : JSON.stringify(block.content)
    }`;
  }

  const semanticChunks: SemanticChunk[] = [];
  for (const chunk of chunkMap.values()) {
    chunk.text = chunk.text.trim();
    semanticChunks.push(chunk);
  }

  return {
    parsed:          normalized.parsed,
    blocks,
    toc:             normalized.toc,
    searchableText:  normalized.searchableText,
    semanticChunks,
    warnings:        normalized.parsed.warnings ?? [],
    confidence:      normalized.parsed.confidence ?? 0.5,
  };
}