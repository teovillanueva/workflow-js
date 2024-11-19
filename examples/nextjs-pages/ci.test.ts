
import { RedisEntry } from "@/utils/types"
import { Client } from "@upstash/qstash"
import { Client as WorkflowClient } from "@upstash/workflow"
import { Redis } from "@upstash/redis"
import { serve } from "@upstash/workflow/nextjs"
import { describe, test, expect } from "bun:test"


type TestConfig = {
  testDescription: string,
  route: string,
  payload: undefined | string | object,
  headers: Record<string, string>,
  expectedResult: unknown
}

const tests: TestConfig[] = [
  {
    testDescription: "should return undefined from empty string",
    route: "api/ci",
    payload: "",
    headers: {
      "Content-Type": "text/plain"
    },
    expectedResult: `step 1 input: 'undefined', type: 'undefined', stringified input: 'undefined'`
  },
  {
    testDescription: "should return foo correctly",
    route: "api/ci",
    payload: "foo",
    headers: {
      "Content-Type": "text/plain"
    },
    expectedResult: `step 1 input: 'foo', type: 'string', stringified input: '"foo"'`
  },
  {
    testDescription: "should allow json without space",
    route: "api/ci",
    payload: `{"foo":"bar"}`,
    headers: {
      "Content-Type": "text/plain"
    },
    expectedResult: `step 1 input: '[object Object]', type: 'object', stringified input: '{"foo":"bar"}'`
  },
  {
    testDescription: "should allow json object",
    route: "api/ci",
    payload: {"foo":"bar"},
    headers: {},
    expectedResult: `step 1 input: '[object Object]', type: 'object', stringified input: '{"foo":"bar"}'`
  },
  {
    testDescription: "should allow json with one space",
    route: "api/ci",
    payload: `{"foo": "bar"}`,
    headers: {
      "Content-Type": "text/plain"
    },
    expectedResult: `step 1 input: '[object Object]', type: 'object', stringified input: '{"foo":"bar"}'`
  },
  {
    testDescription: "should allow json with 3 spaces",
    route: "api/ci",
    payload: `{   "foo"   :   "bar"   }`,
    headers: {
      "Content-Type": "text/plain"
    },
    expectedResult: `step 1 input: '[object Object]', type: 'object', stringified input: '{"foo":"bar"}'`
  }
]

const testEndpoint = ({
  testDescription,
  route,
  payload,
  headers,
  expectedResult,
}: TestConfig) => {
  test(testDescription, async () => {
    if (!process.env.DEPLOYMENT_URL) {
      throw new Error("can't run test without deployment url.")
    }

    const redis = Redis.fromEnv()
    const client = new WorkflowClient({ 
      baseUrl: process.env.QSTASH_URL,
      token: process.env.QSTASH_TOKEN!
     })

    const secret = "secret-" + Math.floor(Math.random() * 10000).toString()
    
    await client.trigger({
      url: `${process.env.DEPLOYMENT_URL}/${route}`,
      body: payload,
      headers: {
        "secret-header": secret,
        ...headers
      }
    })

    await new Promise(r => setTimeout(r, 7000));

    const result = await redis.get<RedisEntry>(`ci-nextjs-pages-ran-${secret}`)
    
    expect(result).toBeDefined()
    expect(result?.secret).toBe(secret)
    expect(result?.result).toBe(expectedResult)
  }, {
    timeout: 15000
  })
}

describe("nextjs-pages", () => {
  test("should send first invocation", async () => {
    const qstashClient = new Client({
      baseUrl: "https://workflow-tests.requestcatcher.com/",
      token: "mock"
    })
    
    // @ts-expect-error mocking publish
    qstashClient.publish = async () => {
      return { messageId: "msgId" }
    }
    
    const { POST: serveHandler } = serve(
      async (context) => {
        await context.sleep("sleeping", 10)
      }, {
        qstashClient,
        receiver: undefined
      }
    )

    const request = new Request("https://workflow-tests.requestcatcher.com/")
    const response = await serveHandler(request)

    // it should send a request, but get failed to parse error because
    // request catcher returns string
    expect(response.status).toBe(200)
    const result = await response.json() as { workflowRunId: string }
    expect(result.workflowRunId).toBeTruthy()
  })

  if (process.env.DEPLOYMENT_URL) {
    tests.forEach(test => {
      testEndpoint(test)
    })
  } else {
    console.log("skipping workflow run tests because DEPLOYMENT_URL is not set");
  }
})
