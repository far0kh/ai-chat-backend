import type { NextRequest } from "next/server"
import { ChatPipelineManager } from "@/lib/chat/pipeline-manager"
import { getModelForPipe } from "@/lib/models/model-factory"
import { validateChatRequest } from "@/middleware/validate-request"
import { UsageTracker } from "@/lib/analytics/usage-tracker"

const usageTracker = new UsageTracker()

export async function POST(req: NextRequest) {
  return validateChatRequest(req, async (validatedReq) => {
    try {
      const { messages, pipeId, options } = await validatedReq.json()

      const pipelineManager = new ChatPipelineManager()
      const pipe = await pipelineManager.getPipe(pipeId)

      if (!pipe) {
        return Response.json({ error: "Invalid pipe ID" }, { status: 404 })
      }

      // Check cache for identical request
      const responseCache = pipelineManager.getResponseCache()
      const cachedResponse = responseCache.get(pipeId, messages)

      if (cachedResponse && !options.skipCache) {
        return new Response(cachedResponse)
      }

      const startTime = Date.now()
      const model = getModelForPipe(pipe)

      const response = await model.generateResponse(messages, {
        ...pipe.config,
        ...options,
      })

      const processingTime = Date.now() - startTime

      // Track usage
      usageTracker.trackUsage({
        timestamp: Date.now(),
        pipeId,
        modelType: pipe.modelType,
        processingTime,
        success: true,
      })

      return response
    } catch (error) {
      console.error("Chat API error:", error)

      // Track error
      usageTracker.trackUsage({
        timestamp: Date.now(),
        pipeId: (await req.json())?.pipeId || "unknown",
        modelType: "unknown" as any,
        processingTime: 0,
        success: false,
      })

      return Response.json({ error: "Failed to process chat request" }, { status: 500 })
    }
  })
}

