import { getExternalRanking } from "../rating/ranking";
import { getVideoDetailByIds, getVideosByQuery } from "../rating/youtube";
import Parse from "parse/node";
import { IResource } from "../types/resource";
import { IWeightedYoutubeVideo } from "../types/youtube";
import { createResource } from "../resources/resources";
import { getImagesByQuery } from "../unsplash/unsplash";

const VIDEOS_PER_QUERY = 100;

export const getUserCourses = async (user: Parse.Object<Parse.Attributes>) => {
  const Course = Parse.Object.extend("Course");
  const query = new Parse.Query(Course);

  query.equalTo("user", user);

  const courses = await query.findAll();

  return courses;
};

export const getCourseByUserAndId = async (
  user: Parse.Object<Parse.Attributes>,
  courseId: string
) => {
  const Course = Parse.Object.extend("Course");
  const query = new Parse.Query(Course);

  query.equalTo("user", user);
  query.equalTo("objectId", courseId);

  const course = await query.find();

  return course[0];
};

export const getProgressByCourse = async (
  user: Parse.Object<Parse.Attributes>,
  courseId: string
) => {
  const Resource = Parse.Object.extend("Resource");
  const Course = Parse.Object.extend("Course");

  const query = new Parse.Query(Resource);

  const course = new Course();
  course.id = courseId;

  query.equalTo("user", user);
  query.equalTo("course", course);

  const resources = await query.findAll();

  // filter by level
  const beginnerLevelResources = resources.filter(
    (resource: any) => resource.level === 1
  );
  const advancedLevelResources = resources.filter(
    (resource: any) => resource.level === 2
  );

  console.log(beginnerLevelResources);
  return {
    1: calculateCourseCompletition(beginnerLevelResources),
    2: calculateCourseCompletition(advancedLevelResources),
  };
};

export const createCourse = async (
  name: string,
  user: Parse.Object<Parse.Attributes>
) => {
  const Course: Parse.Object = new Parse.Object("Course");

  const images = await getImagesByQuery(name);

  Course.set("name", name);
  Course.set("images", images);
  Course.set("user", user);
  return Course;
};

export const saveResources = async (
  resources: IWeightedYoutubeVideo[],
  course: Parse.Object<Parse.Attributes>,
  level: 1 | 2,
  user: Parse.User<Parse.Attributes>
) => {
  for (const resource of resources) {
    const video = createResource({
      type: "video",
      level,
      status: "not started",
      title: resource.snippet.title,
      description: resource.snippet.description,
      url: `https://youtube.com/video/${resource.id}`,
      thumbnail: resource.snippet.thumbnails.high.url,
      channel: resource.snippet.channelTitle,
      feedback: 0,
      course,
      user,
    });

    await video.save();
  }
};

export const generateResources = async (name: string) => {
  const rankedBeginner = await getTop3ByDifficulty(name, "beginner");
  const rankedAdvanced = await getTop3ByDifficulty(name, "advanced");

  return {
    beginner: rankedBeginner,
    advanced: rankedAdvanced,
  };
};

const getTop3ByDifficulty = async (query: string, difficulty: string) => {
  const rankedVideos = await getRankedVideos(`${difficulty} ${query} tutorial`);
  const splicedRankedVideos = rankedVideos.splice(0, 3);
  return splicedRankedVideos;
};

const getRankedVideos = async (query: string) => {
  const videos = await getVideosByQuery(query, VIDEOS_PER_QUERY);

  const ids = [];
  for (const video of videos.data.items) {
    ids.push(video.id.videoId);
  }

  const videosDetailed = await getVideoDetailByIds(ids, VIDEOS_PER_QUERY);

  const rankedVideos = getExternalRanking(videosDetailed.data.items);
  const sortedRankedVideos = rankedVideos.sort(
    (a, b) => b.final_score - a.final_score
  );

  return sortedRankedVideos;
};

const calculateCourseCompletition = (
  resources: Parse.Object<Parse.Attributes>[]
) => {
  let totalCompleted = 0;
  let totalInProgress = 0;

  for (const resource of resources) {
    if ((resource as any).status === "completed") totalCompleted++;
    if ((resource as any).status === "in progress") totalInProgress++;
  }

  return ((totalCompleted + 0.5 * totalInProgress) / resources.length) * 100;
};
