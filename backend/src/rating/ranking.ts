import type { youtube_v3 } from "googleapis/build/src/apis/youtube/v3";
import { ExpressError } from "../utils/errors";
import { parseISO, differenceInCalendarDays } from "date-fns";
import { normalize } from "../utils/math";
import {
  INormalizedYoutubeVideo,
  IRawYoutubeVideo,
  IWeightedYoutubeVideo,
} from "../types/youtube";

interface IMaxScores {
  dateXViews: number;
  dateXLikes: number;
}

/*
Youtube Video Ranking Algorithm
For more information: https://docs.google.com/document/d/1zxYRyytmbbvfAZkQc8dampD9Vhun0XQtWepKYxWUTKo/edit?usp=sharing

This algorithm starts at `getExternalRanking` and where it first gets the raw score for each of the videos that were passed in the function. For every `ranking-features` it uses the formula described in 
the document above.

Then, since we cannot have raw scores, we have to normalize then. Since normalizing requires a minimum and a maximum, we need to find the maximum raw score for each features. `getMaxScores` does that.
After that, we normalize all `ranking-features` with the information we got before.
Finally, we apply weights to each `ranking-feature` so it matches the formula proposed before. We sum everything up, and that's our final score that will be used to rank the videos
*/

export const WEIGHTS = {
  weight1: 60,
  weight2: 40,
  weight3: 100,
  weight4: 0,
  weight5: 100,
  weight6: 0,
};

export function getExternalRanking(videos: youtube_v3.Schema$Video[]) {
  const a = 2;
  const rawExternalScoreVideos = getRawExternalRanking(videos);
  const maxScores = getMaxScores(rawExternalScoreVideos);
  const normalizedExternalScoreVideos = getNormalizedExternalRanking(
    rawExternalScoreVideos,
    maxScores
  );
  return getWeightedExternalRanking(normalizedExternalScoreVideos);
}

export function getRawExternalRanking(
  videos: youtube_v3.Schema$Video[]
): IRawYoutubeVideo[] {
  return videos.map((video) => {
    const daysSincePublished = getDaysSincePublished(video.snippet.publishedAt);
    const yearsSincePublished = daysSincePublished / 264;

    const rawDateScore = getDateScore(yearsSincePublished);
    const rawDateXViewsScore = getDateXViewsScore(
      parseInt(video.statistics.viewCount),
      yearsSincePublished
    );
    const rawDateXLikesScore = getDateXLikes(
      parseInt(video.statistics.likeCount),
      daysSincePublished
    );
    const useOfChapters = getUseOfChapters(video.snippet.description);

    return {
      ...video,
      raw_score: {
        date: rawDateScore,
        dateXViews: rawDateXViewsScore,
        dateXLikes: rawDateXLikesScore,
        useOfChapters,
      },
    };
  });
}

export function getNormalizedExternalRanking(
  videos: IRawYoutubeVideo[],
  maxScores: IMaxScores
): INormalizedYoutubeVideo[] {
  return videos.map((video) => {
    return {
      ...video,
      normalized_score: {
        date: normalize(video.raw_score.date, 0, 10),
        dateXLikes: normalize(
          video.raw_score.dateXLikes,
          0,
          maxScores.dateXLikes
        ),
        dateXViews: normalize(
          video.raw_score.dateXViews,
          0,
          maxScores.dateXViews
        ),
        useOfChapters: video.raw_score.useOfChapters,
      },
    };
  });
}

export function getWeightedExternalRanking(
  videos: INormalizedYoutubeVideo[]
): IWeightedYoutubeVideo[] {
  return videos.map((video) => {
    const weighted_score = {
      date: video.normalized_score.date * WEIGHTS.weight1,
      dateXLikes: video.normalized_score.dateXLikes * WEIGHTS.weight2,
      dateXViews: video.normalized_score.dateXViews * WEIGHTS.weight3,
      useOfChapters: video.normalized_score.useOfChapters * WEIGHTS.weight5,
    };

    const final_score =
      0.5 * (weighted_score.date + weighted_score.dateXLikes) +
      0.3 * weighted_score.dateXViews +
      0.2 * weighted_score.useOfChapters;

    return {
      ...video,
      weighted_score,
      final_score,
    };
  });
}

export function getMaxScores(
  rawExternalRankingVideos: IRawYoutubeVideo[]
): IMaxScores {
  const maxScore = {
    dateXViews: 0,
    dateXLikes: 0,
  };

  for (const video of rawExternalRankingVideos) {
    maxScore.dateXViews = Math.max(
      maxScore.dateXViews,
      video.raw_score.dateXViews
    );
    maxScore.dateXLikes = Math.max(
      maxScore.dateXLikes,
      video.raw_score.dateXLikes
    );
  }

  return maxScore;
}

export function getDateScore(yearsSincePublished: number) {
  // Following the function in https://docs.google.com/document/d/1zxYRyytmbbvfAZkQc8dampD9Vhun0XQtWepKYxWUTKo
  return Math.max(-Math.pow(1.6, yearsSincePublished) + 11, 0);
}

export function getDateXViewsScore(views: number, daysSincePublished: number) {
  return views / daysSincePublished;
}

export function getDateXLikes(likes: number, daysSincePublished: number) {
  return likes / daysSincePublished;
}

export function getUseOfChapters(description: string) {
  const usesChapters = description.match("[0-9]:[0-9]");
  return usesChapters !== null ? 1 : 0;
}

export function getDaysSincePublished(publishedAt: string) {
  const publishedAtDate = parseISO(publishedAt);
  const daysSincePublished = differenceInCalendarDays(
    new Date(),
    publishedAtDate
  );
  return daysSincePublished;
}
