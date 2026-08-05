import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mergePeople } from "../../../../src/server/people-api";
const noStore={"cache-control":"no-store"};
export async function POST(request:NextRequest){if(!isSameOriginRequest(request.url,request.headers.get("origin")))return NextResponse.json({message:"Cross-origin merges are not allowed."},{status:403,headers:noStore});try{return NextResponse.json(await mergePeople(await request.json()),{headers:noStore});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"People could not be merged."},{status:400,headers:noStore});}}
