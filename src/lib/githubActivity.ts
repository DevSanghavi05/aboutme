export type GithubActivityData = {
  levels: number[];
  total: number;
};

const levelByName: Record<string, number> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

async function getAuthenticatedActivity(token: string): Promise<GithubActivityData | null> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
        query {
          user(login: "DevSanghavi05") {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays { date contributionLevel }
                }
              }
            }
          }
        }
      `,
    }),
    next: { revalidate: 3600 },
  });

  if (!response.ok) return null;
  const payload = await response.json();
  const calendar = payload?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar?.weeks) return null;

  const levels = Array<number>(53 * 7).fill(0);
  calendar.weeks.slice(-53).forEach(
    (week: { contributionDays: { date: string; contributionLevel: string }[] }, weekIndex: number) => {
      week.contributionDays.forEach((day) => {
        const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
        levels[weekIndex * 7 + weekday] = levelByName[day.contributionLevel] ?? 0;
      });
    },
  );

  return { levels, total: Number(calendar.totalContributions) || 0 };
}

async function getPublicActivity(): Promise<GithubActivityData | null> {
  try {
    const response = await fetch(
      "https://github.com/users/DevSanghavi05/contributions",
      { next: { revalidate: 3600 } },
    );
    if (!response.ok) return null;

    const markup = await response.text();
    const levels = Array<number>(53 * 7).fill(0);
    const cells = markup.matchAll(
      /id="contribution-day-component-(\d+)-(\d+)" data-level="([0-4])"/g,
    );
    let found = 0;

    for (const cell of cells) {
      const day = Number(cell[1]);
      const week = Number(cell[2]);
      const level = Number(cell[3]);
      if (day < 7 && week < 53) {
        levels[week * 7 + day] = level;
        found += 1;
      }
    }

    const totalMatch = markup.match(/([\d,]+)\s+contributions?\s+(?:in the last year|this year)/i);
    const total = totalMatch ? Number(totalMatch[1].replaceAll(",", "")) : 0;
    return found > 300 ? { levels, total } : null;
  } catch {
    return null;
  }
}

export async function getGithubActivity(): Promise<GithubActivityData> {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    const authenticated = await getAuthenticatedActivity(token);
    if (authenticated) return authenticated;
  }

  return (await getPublicActivity()) ?? {
    levels: Array<number>(53 * 7).fill(0),
    total: 0,
  };
}
