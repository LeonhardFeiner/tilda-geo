import { describe, expect, test } from "vitest";
import { parseUnfallatlasCsv } from "./fetchAccidents";

describe("parseUnfallatlasCsv", () => {
  test("parses Unfallatlas CSV header and aggregates accidents by AGS", () => {
    const csv = [
      "OID_;UIDENTSTLAE;ULAND;UREGBEZ;UKREIS;UGEMEINDE;UJAHR;UMONAT;USTUNDE;UWOCHENTAG;UKATEGORIE;UART;UTYP1;ULICHTVERH;IstStrassenzustand;IstRad;IstPKW;IstFuss;IstKrad;IstGkfz;IstSonstige;LINREFX;LINREFY;XGCSWGS84;YGCSWGS84;PLST",
      // Fatal bike accident in Kiel (01002000)
      "1;012301;01;0;02;000;2023;05;12;5;1;5;2;2;0;1;1;0;0;0;0;574751;6018282;10.1488;54.3069;1",
      // Severe bike accident in Kiel (01002000)
      "2;012302;01;0;02;000;2023;05;14;6;2;5;2;0;0;1;0;0;0;0;1;572054;6018075;10.1073;54.3054;1",
      // Car-only accident in Kiel (01002000)
      "3;012303;01;0;02;000;2023;05;15;6;3;2;6;0;0;0;1;0;0;0;0;572054;6018075;10.1073;54.3054;1",
      // Light bike accident in Flensburg (01001000)
      "4;012304;01;0;01;000;2023;05;16;6;3;8;1;2;0;1;1;0;0;0;0;527894;6071520;9.4337;54.7900;1",
    ].join("\n");

    const result = parseUnfallatlasCsv(csv);

    expect(result.size).toBe(2);

    const kiel = result.get("01002000");
    expect(kiel).toBeDefined();
    expect(kiel?.totalAccidents).toBe(3);
    expect(kiel?.bikeAccidents).toBe(2);
    expect(kiel?.bikeFatal).toBe(1);
    expect(kiel?.bikeSevere).toBe(1);
    expect(kiel?.bikeLight).toBe(0);
    expect(kiel?.bikeFatalOrSevere).toBe(2);

    const flensburg = result.get("01001000");
    expect(flensburg).toBeDefined();
    expect(flensburg?.totalAccidents).toBe(1);
    expect(flensburg?.bikeAccidents).toBe(1);
    expect(flensburg?.bikeFatal).toBe(0);
    expect(flensburg?.bikeSevere).toBe(0);
    expect(flensburg?.bikeLight).toBe(1);
    expect(flensburg?.bikeFatalOrSevere).toBe(0);
  });

  test("returns empty map for invalid or empty input", () => {
    expect(parseUnfallatlasCsv("").size).toBe(0);
    expect(parseUnfallatlasCsv("invalid;csv").size).toBe(0);
  });
});
