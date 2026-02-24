import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export async function rateLimit(indetifier:string){
    const rateLimit = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter:Ratelimit.slidingWindow(10, "10 s"),
        analytics: true,
        prefix: "@upstash/rate-limit",
    });

    return await rateLimit.limit(indetifier);
}