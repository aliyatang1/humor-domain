"use server";

import { requireSuperadmin, createSupabaseServerClient } from "@/lib/supabase/server";

// Dashboard Stats
export async function getAdminDashboardStats() {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  // Total votes all-time
  const { count: totalVotes } = await supabase
    .from("caption_votes")
    .select("*", { count: "exact" });

  // Total votes this week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: weekVotes } = await supabase
    .from("caption_votes")
    .select("*", { count: "exact" })
    .gte("created_datetime_utc", weekAgo.toISOString());

  // Get all captions with vote counts
  const { data: allCaptions } = await supabase
    .from("captions")
    .select("id, content");

  const { data: allVotes } = await supabase
    .from("caption_votes")
    .select("caption_id, vote_value, created_datetime_utc");

  // Compute vote counts per caption
  const votesByCaption = new Map<
    string,
    { upvotes: number; downvotes: number; total: number; latest: string }
  >();

  allVotes?.forEach((vote: any) => {
    if (!votesByCaption.has(vote.caption_id)) {
      votesByCaption.set(vote.caption_id, {
        upvotes: 0,
        downvotes: 0,
        total: 0,
        latest: vote.created_datetime_utc,
      });
    }
    const current = votesByCaption.get(vote.caption_id)!;
    if (vote.vote_value === 1) {
      current.upvotes++;
    } else {
      current.downvotes++;
    }
    current.total++;
    current.latest = vote.created_datetime_utc;
  });

  // Top voted captions
  const topCaptions = (allCaptions || [])
    .map((cap: any) => {
      const votes = votesByCaption.get(cap.id);
      return {
        id: cap.id,
        content: cap.content,
        total_votes: votes?.total || 0,
      };
    })
    .sort((a, b) => b.total_votes - a.total_votes)
    .slice(0, 5);

  // Trending captions (newest with high votes)
  const trendingCaptions = (allCaptions || [])
    .map((cap: any) => {
      const votes = votesByCaption.get(cap.id);
      return {
        id: cap.id,
        content: cap.content,
        recent_votes: votes?.total || 0,
      };
    })
    .sort((a, b) => b.recent_votes - a.recent_votes)
    .slice(0, 5);

  // Active voters this week
  const weekAgoActiveVoters = new Date();
  weekAgoActiveVoters.setDate(weekAgoActiveVoters.getDate() - 7);
  const { data: voterData } = await supabase
    .from("caption_votes")
    .select("profile_id")
    .gte("created_datetime_utc", weekAgoActiveVoters.toISOString());

  const activeVotersCount = new Set(
    voterData?.map((v: any) => v.profile_id) || []
  ).size;

  // Total images
  const { count: totalImages } = await supabase
    .from("images")
    .select("*", { count: "exact" });

  // Total captions
  const { count: totalCaptions } = await supabase
    .from("captions")
    .select("*", { count: "exact" });

  // Total users
  const { count: totalUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact" });

  return {
    totalVotes: totalVotes || 0,
    weekVotes: weekVotes || 0,
    totalImages: totalImages || 0,
    totalCaptions: totalCaptions || 0,
    totalUsers: totalUsers || 0,
    activeVotersThisWeek: activeVotersCount,
    topCaptions,
    trendingCaptions,
  };
}

// User Management
export async function getUsers() {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, email, is_superadmin, created_datetime_utc")
    .order("created_datetime_utc", { ascending: false });

  if (error) throw error;
  return users || [];
}

export async function updateUser(
  userId: string,
  updates: {
    is_superadmin?: boolean;
  }
) {
  const { user } = await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...updates,
      modified_by_user_id: user.id,
      created_by_user_id: user.id,
    })
    .eq("id", userId)
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

export async function deleteUser(userId: string) {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (error) throw error;
  return true;
}

// Image Management
export async function getImages() {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data: images, error } = await supabase
    .from("images")
    .select("id, url, is_public, created_datetime_utc")
    .order("created_datetime_utc", { ascending: false });

  if (error) throw error;

  // Get caption counts for each image
  const { data: captionCounts } = await supabase
    .from("captions")
    .select("image_id");

  const countMap = new Map<string, number>();
  captionCounts?.forEach((row: any) => {
    countMap.set(row.image_id, (countMap.get(row.image_id) || 0) + 1);
  });

  return (images || []).map((img: any) => ({
    ...img,
    captionCount: countMap.get(img.id) || 0,
  }));
}

export async function updateImagePublic(
  imageId: string,
  isPublic: boolean
) {
  const { user } = await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("images")
    .update({ is_public: isPublic, modified_by_user_id: user.id })
    .eq("id", imageId)
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

export async function deleteImage(imageId: string) {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  // Delete captions first (cascade)
  const { error: captionError } = await supabase
    .from("captions")
    .delete()
    .eq("image_id", imageId);

  if (captionError) throw captionError;

  // Then delete image
  const { error: imageError } = await supabase
    .from("images")
    .delete()
    .eq("id", imageId);

  if (imageError) throw imageError;
  return true;
}

// Image Upload Management
export async function uploadImage(
  imageUrl: string,
  isPublic: boolean = false
) {
  const { user } = await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("images")
    .insert([
      {
        url: imageUrl,
        is_public: isPublic,
        created_datetime_utc: new Date().toISOString(),
        created_by_user_id: user.id,
        modified_by_user_id: user.id,
      },
    ])
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

// Caption Management
export async function getCaptions() {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data: captions, error } = await supabase
    .from("captions")
    .select("id, content, image_id, created_datetime_utc")
    .order("created_datetime_utc", { ascending: false });

  if (error) throw error;

  // Get vote counts for each caption
  const { data: voteCounts } = await supabase
    .from("caption_votes")
    .select("caption_id, vote_value");

  const voteMap = new Map<string, { upvotes: number; downvotes: number }>();
  voteCounts?.forEach((vote: any) => {
    if (!voteMap.has(vote.caption_id)) {
      voteMap.set(vote.caption_id, { upvotes: 0, downvotes: 0 });
    }
    if (vote.vote_value === 1) {
      voteMap.get(vote.caption_id)!.upvotes++;
    } else {
      voteMap.get(vote.caption_id)!.downvotes++;
    }
  });

  return (captions || []).map((cap: any) => ({
    ...cap,
    votes: voteMap.get(cap.id) || { upvotes: 0, downvotes: 0 },
  }));
}

export async function createCaption(
  content: string,
  image_id: string
) {
  const { user } = await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("captions")
    .insert([
      {
        content,
        image_id,
        created_by_user_id: user.id,
        modified_by_user_id: user.id,
      },
    ])
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

export async function updateCaption(
  id: string,
  content: string
) {
  const { user } = await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("captions")
    .update({ content, modified_by_user_id: user.id })
    .eq("id", id)
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

export async function deleteCaption(id: string) {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  // Delete votes first (cascade)
  const { error: voteError } = await supabase
    .from("caption_votes")
    .delete()
    .eq("caption_id", id);

  if (voteError) throw voteError;

  // Then delete caption
  const { error: captionError } = await supabase
    .from("captions")
    .delete()
    .eq("id", id);

  if (captionError) throw captionError;
  return true;
}

// Humor Flavors Management
export async function getHumorFlavors() {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("humor_flavors")
    .select("id, created_datetime_utc, description, slug")
    .order("created_datetime_utc", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createHumorFlavor(
  description: string,
  slug: string
) {
  const { user } = await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("humor_flavors")
    .insert([
      {
        description,
        slug,
        created_datetime_utc: new Date().toISOString(),
        created_by_user_id: user.id,
        modified_by_user_id: user.id,
      },
    ])
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

export async function updateHumorFlavor(
  id: number,
  description: string,
  slug: string
) {
  const { user } = await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("humor_flavors")
    .update({ description, slug, modified_by_user_id: user.id })
    .eq("id", id)
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

export async function deleteHumorFlavor(id: number) {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  // Delete flavor steps first (cascade)
  const { error: stepsError } = await supabase
    .from("humor_flavor_steps")
    .delete()
    .eq("humor_flavor_id", id);

  if (stepsError) throw stepsError;

  // Then delete flavor
  const { error: flavorError } = await supabase
    .from("humor_flavors")
    .delete()
    .eq("id", id);

  if (flavorError) throw flavorError;
  return true;
}

// Humor Flavor Steps Management
export async function getHumorFlavorSteps(flavorId: number) {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("humor_flavor_steps")
    .select("*")
    .eq("humor_flavor_id", flavorId)
    .order("order_by", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createHumorFlavorStep(
  humorFlavorId: number,
  orderBy: number,
  llmTemperature: number | null,
  llmInputTypeId: number,
  llmOutputTypeId: number,
  llmModelId: number,
  humorFlavorStepTypeId: number,
  llmSystemPrompt: string,
  llmUserPrompt: string,
  description: string | null
) {
  const { user } = await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("humor_flavor_steps")
    .insert([
      {
        humor_flavor_id: humorFlavorId,
        order_by: orderBy,
        llm_temperature: llmTemperature,
        llm_input_type_id: llmInputTypeId,
        llm_output_type_id: llmOutputTypeId,
        llm_model_id: llmModelId,
        humor_flavor_step_type_id: humorFlavorStepTypeId,
        llm_system_prompt: llmSystemPrompt,
        llm_user_prompt: llmUserPrompt,
        description,
        created_datetime_utc: new Date().toISOString(),
        created_by_user_id: user.id,
        modified_by_user_id: user.id,
      },
    ])
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

export async function updateHumorFlavorStep(
  id: number,
  orderBy: number,
  llmTemperature: number | null,
  llmInputTypeId: number,
  llmOutputTypeId: number,
  llmModelId: number,
  humorFlavorStepTypeId: number,
  llmSystemPrompt: string,
  llmUserPrompt: string,
  description: string | null
) {
  const { user } = await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("humor_flavor_steps")
    .update({
      order_by: orderBy,
      llm_temperature: llmTemperature,
      llm_input_type_id: llmInputTypeId,
      llm_output_type_id: llmOutputTypeId,
      llm_model_id: llmModelId,
      humor_flavor_step_type_id: humorFlavorStepTypeId,
      llm_system_prompt: llmSystemPrompt,
      llm_user_prompt: llmUserPrompt,
      description,
      modified_by_user_id: user.id,
    })
    .eq("id", id)
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

export async function deleteHumorFlavorStep(id: number) {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("humor_flavor_steps")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}

// LLM Prompt Chains Management
export async function getLLMPromptChains() {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("llm_prompt_chains")
    .select("id, created_datetime_utc, caption_request_id")
    .order("created_datetime_utc", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createLLMPromptChain(
  captionRequestId: number
) {
  const { user } = await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("llm_prompt_chains")
    .insert([
      {
        caption_request_id: captionRequestId,
        created_datetime_utc: new Date().toISOString(),
        created_by_user_id: user.id,
        modified_by_user_id: user.id,
      },
    ])
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

export async function updateLLMPromptChain(
  id: number,
  captionRequestId: number
) {
  const { user } = await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("llm_prompt_chains")
    .update({ caption_request_id: captionRequestId, modified_by_user_id: user.id })
    .eq("id", id)
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

export async function deleteLLMPromptChain(id: number) {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  // Delete responses first (cascade)
  const { error: responsesError } = await supabase
    .from("llm_model_responses")
    .delete()
    .eq("llm_prompt_chain_id", id);

  if (responsesError) throw responsesError;

  // Then delete chain
  const { error: chainError } = await supabase
    .from("llm_prompt_chains")
    .delete()
    .eq("id", id);

  if (chainError) throw chainError;
  return true;
}

// LLM Responses (Read-only)
export async function getLLMResponses(chainId: number) {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("llm_model_responses")
    .select("*")
    .eq("llm_prompt_chain_id", chainId)
    .order("created_datetime_utc", { ascending: false });

  if (error) throw error;
  return data || [];
}
