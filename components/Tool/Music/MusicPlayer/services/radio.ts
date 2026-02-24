export const randomRadioStations = async (limit: number = 30) => {
  try {
    const response = await fetch(
      `https://all.api.radio-browser.info/json/stations/search?country=United%20States&language=english&order=votes&reverse=true&limit=${limit}`
    );
    const data = await response.json();
    return {
      status: 200,
      data,
    };
  } catch (error) {
    console.error(error);
    return {
      status: 500,
      message: "Error fetching radio stations",
    };
  }
};
