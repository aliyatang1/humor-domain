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
    .select("id, email, full_name, is_superadmin, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return users || [];
}

export async function updateUser(
  userId: string,
  updates: {
    full_name?: string;
    is_superadmin?: boolean;
  }
) {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
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
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("images")
    .update({ is_public: isPublic })
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

// Caption Management (Read-only)
export async function getCaptions() {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  const { data: captions, error } = await supabase
    .from("captions")
    .select("id, content, image_id, created_at")
    .order("created_at", { ascending: false });

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
