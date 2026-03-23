"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function submitVote(
  captionId: string,
  voteType: "upvote" | "downvote"
) {
  // Get the server-side Supabase client with cookies
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  // Get the authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "You must be logged in to vote",
    };
  }

  // Convert vote type to vote value: upvote = 1, downvote = -1
  const voteValue = voteType === "upvote" ? 1 : -1;

  // Use upsert to either create a new vote or update existing one
  const { error } = await supabase.from("caption_votes").upsert(
    {
      caption_id: captionId,
      profile_id: user.id,
      vote_value: voteValue,
      created_by_user_id: user.id,
      modified_by_user_id: user.id,
    },
    {
      onConflict: "profile_id,caption_id",
    }
  );

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
    error: null,
  };
}
