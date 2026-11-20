#!/usr/bin/env python3
"""Unit tests for scripts/ingest.py covering NaPTAN CSV and TransXChange 2.1 / 2.4 XML."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import ingest  # noqa: E402


SAMPLE_NAPTAN_CSV = """\ufeffATCOCode,CommonName,LocalityName,Indicator,Latitude,Longitude,Status,StopType
670000101,Whitesands,Dumfries,Stand 3,55.069123,-3.613456,active,BCS
670000102,DGRI Main Entrance,Dumfries,outside,55.061901,-3.643102,,BCT
670000201,High Street,Annan,opp Bank of Scotland,54.987111,-3.259822,active,BCT
670000999,Old Closed Stop,Annan,adj,54.986000,-3.258000,inactive,BCT
670000888,Dumfries Rail Station,Dumfries,,55.074800,-3.606100,active,RLY
"""

TXC_21_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<TransXChange xmlns="http://www.transxchange.org.uk/" SchemaVersion="2.1">
  <StopPoints>
    <AnnotatedStopPointRef>
      <StopPointRef>670000101</StopPointRef>
      <CommonName>Whitesands</CommonName>
      <LocalityName>Dumfries</LocalityName>
    </AnnotatedStopPointRef>
    <AnnotatedStopPointRef>
      <StopPointRef>670000201</StopPointRef>
      <CommonName>High Street</CommonName>
      <LocalityName>Annan</LocalityName>
    </AnnotatedStopPointRef>
    <AnnotatedStopPointRef>
      <StopPointRef>090012345</StopPointRef>
      <CommonName>Bus Station</CommonName>
      <LocalityName>Carlisle</LocalityName>
      <Location>
        <Latitude>54.8925</Latitude>
        <Longitude>-2.9329</Longitude>
      </Location>
    </AnnotatedStopPointRef>
  </StopPoints>
  <JourneyPatternSections>
    <JourneyPatternSection id="JPS1">
      <JourneyPatternTimingLink id="TL1">
        <From><StopPointRef>670000101</StopPointRef></From>
        <To>
          <StopPointRef>670000201</StopPointRef>
          <WaitTime>PT2M</WaitTime>
        </To>
        <RunTime>PT35M</RunTime>
      </JourneyPatternTimingLink>
    </JourneyPatternSection>
    <JourneyPatternSection id="JPS2">
      <JourneyPatternTimingLink id="TL2">
        <From><StopPointRef>670000201</StopPointRef></From>
        <To><StopPointRef>090012345</StopPointRef></To>
        <RunTime>PT1H5M30S</RunTime>
      </JourneyPatternTimingLink>
    </JourneyPatternSection>
  </JourneyPatternSections>
  <Operators>
    <Operator id="OP1">
      <TradingName>Stagecoach West Scotland</TradingName>
    </Operator>
  </Operators>
  <Services>
    <Service>
      <ServiceCode>SC79</ServiceCode>
      <Lines>
        <Line id="L79"><LineName>79</LineName></Line>
      </Lines>
      <OperatingPeriod>
        <StartDate>2025-01-01</StartDate>
        <EndDate>2030-12-31</EndDate>
      </OperatingPeriod>
      <OperatingProfile>
        <RegularDayType>
          <DaysOfWeek><MondayToFriday/></DaysOfWeek>
        </RegularDayType>
        <BankHolidayOperation>
          <DaysOfNonOperation><AllBankHolidays/></DaysOfNonOperation>
        </BankHolidayOperation>
      </OperatingProfile>
      <RegisteredOperatorRef>OP1</RegisteredOperatorRef>
      <Description>Dumfries - Annan - Carlisle</Description>
      <StandardService>
        <Origin>Dumfries</Origin>
        <Destination>Carlisle</Destination>
        <JourneyPattern id="JP_OUT">
          <Direction>outbound</Direction>
          <DestinationDisplay>Carlisle Bus Station</DestinationDisplay>
          <JourneyPatternSectionRefs>JPS1</JourneyPatternSectionRefs>
          <JourneyPatternSectionRefs>JPS2</JourneyPatternSectionRefs>
        </JourneyPattern>
      </StandardService>
    </Service>
  </Services>
  <VehicleJourneys>
    <VehicleJourney>
      <VehicleJourneyCode>VJ1</VehicleJourneyCode>
      <ServiceRef>SC79</ServiceRef>
      <LineRef>L79</LineRef>
      <JourneyPatternRef>JP_OUT</JourneyPatternRef>
      <DepartureTime>08:10:00</DepartureTime>
    </VehicleJourney>
    <VehicleJourney>
      <OperatingProfile>
        <RegularDayType>
          <DaysOfWeek><MondayToFriday/></DaysOfWeek>
        </RegularDayType>
        <ServicedOrganisationDayType>
          <DaysOfOperation>
            <WorkingDays><ServicedOrganisationRef>DG_SCH</ServicedOrganisationRef></WorkingDays>
          </DaysOfOperation>
        </ServicedOrganisationDayType>
      </OperatingProfile>
      <VehicleJourneyCode>VJ2</VehicleJourneyCode>
      <VehicleJourneyRef>VJ1</VehicleJourneyRef>
      <DepartureTime>15:20:00</DepartureTime>
      <VehicleJourneyTimingLink>
        <JourneyPatternTimingLinkRef>TL1</JourneyPatternTimingLinkRef>
        <RunTime>PT40M</RunTime>
      </VehicleJourneyTimingLink>
    </VehicleJourney>
  </VehicleJourneys>
</TransXChange>
"""

TXC_24_NON_DG_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<txc:TransXChange xmlns:txc="http://www.transxchange.org.uk/v2.4" SchemaVersion="2.4">
  <txc:StopPoints>
    <txc:AnnotatedStopPointRef>
      <txc:StopPointRef>609000123</txc:StopPointRef>
      <txc:CommonName>Buchanan Bus Station</txc:CommonName>
    </txc:AnnotatedStopPointRef>
  </txc:StopPoints>
</txc:TransXChange>
"""

TXC_24_DG_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<txc:TransXChange xmlns:txc="http://www.transxchange.org.uk/v2.4" SchemaVersion="2.4">
  <txc:JourneyPatternSections>
    <txc:JourneyPatternSection id="SEC_IN">
      <txc:JourneyPatternTimingLink id="TL_A">
        <txc:From><txc:StopPointRef>670000102</txc:StopPointRef></txc:From>
        <txc:To><txc:StopPointRef>670000101</txc:StopPointRef></txc:To>
        <txc:RunTime>PT12M</txc:RunTime>
      </txc:JourneyPatternTimingLink>
    </txc:JourneyPatternSection>
  </txc:JourneyPatternSections>
  <txc:Operators>
    <txc:Operator id="OP_HG">
      <txc:OperatorShortName>Houstons Coaches</txc:OperatorShortName>
    </txc:Operator>
  </txc:Operators>
  <txc:Services>
    <txc:Service>
      <txc:ServiceCode>SCD3</txc:ServiceCode>
      <txc:Lines>
        <txc:Line id="LD3"><txc:LineName>D3</txc:LineName></txc:Line>
      </txc:Lines>
      <txc:RegisteredOperatorRef>OP_HG</txc:RegisteredOperatorRef>
      <txc:StandardService>
        <txc:Origin>Dumfries Whitesands</txc:Origin>
        <txc:Destination>DGRI Hospital</txc:Destination>
        <txc:JourneyPattern id="JP_IN">
          <txc:Direction>inbound</txc:Direction>
          <txc:JourneyPatternSectionRefs>SEC_IN</txc:JourneyPatternSectionRefs>
        </txc:JourneyPattern>
      </txc:StandardService>
    </txc:Service>
  </txc:Services>
  <txc:VehicleJourneys>
    <txc:VehicleJourney>
      <txc:OperatingProfile>
        <txc:RegularDayType>
          <txc:DaysOfWeek><txc:Weekend/></txc:DaysOfWeek>
        </txc:RegularDayType>
        <txc:ServicedOrganisationDayType>
          <txc:DaysOfOperation>
            <txc:Holidays><ServicedOrganisationRef>DG_SCH</ServicedOrganisationRef></txc:Holidays>
          </txc:DaysOfOperation>
        </txc:ServicedOrganisationDayType>
      </txc:OperatingProfile>
      <txc:VehicleJourneyCode>VJD3</txc:VehicleJourneyCode>
      <txc:ServiceRef>SCD3</txc:ServiceRef>
      <txc:LineRef>LD3</txc:LineRef>
      <txc:JourneyPatternRef>JP_IN</txc:JourneyPatternRef>
      <txc:DepartureTime>09:05:00</txc:DepartureTime>
    </txc:VehicleJourney>
  </txc:VehicleJourneys>
</txc:TransXChange>
"""


class TestIngestPipeline(unittest.TestCase):
    def test_iso_duration_parsing(self) -> None:
        self.assertEqual(ingest.parse_iso_duration("PT4M"), 240)
        self.assertEqual(ingest.parse_iso_duration("PT1H15M"), 4500)
        self.assertEqual(ingest.parse_iso_duration("PT30S"), 30)
        self.assertEqual(ingest.parse_iso_duration("PT1H5M30S"), 3930)
        self.assertEqual(ingest.parse_iso_duration(""), 0)

    def test_naptan_csv_parsing(self) -> None:
        stops = ingest.parse_naptan_stops(SAMPLE_NAPTAN_CSV.encode("utf-8"))
        self.assertEqual(set(stops.keys()), {"670000101", "670000102", "670000201"})
        self.assertEqual(stops["670000101"]["lat"], 55.06912)
        self.assertEqual(stops["670000101"]["indicator"], "Stand 3")
        self.assertEqual(stops["670000102"]["name"], "DGRI Main Entrance")

    def test_txc_21_timing_inheritance_and_school_flags(self) -> None:
        parsed = ingest.parse_txc_xml(TXC_21_XML, reference_date="2026-11-20")
        self.assertIsNotNone(parsed)
        assert parsed is not None
        trips = parsed["trips"]
        self.assertEqual(len(trips), 2)

        # Trip 1: 08:10 + 35m = 08:45 (wait 2m -> dep 08:47) + 1h5m30s = 09:52:30 -> 09:52
        t1 = trips[0]
        self.assertEqual(t1["lineName"], "79")
        self.assertEqual(t1["operator"], "Stagecoach West Scotland")
        self.assertEqual(t1["days"], ["Mon", "Tue", "Wed", "Thu", "Fri"])
        self.assertFalse(t1["schoolOnly"])
        self.assertFalse(t1["nonSchoolOnly"])
        self.assertEqual(t1["bankHolidays"], "Does not run on bank holidays")
        self.assertEqual(
            t1["stops"],
            [
                ["670000101", "08:10"],
                ["670000201", "08:45"],
                ["090012345", "09:52"],
            ],
        )

        # Trip 2 inherits JourneyPatternRef from VJ1, overrides TL1 RunTime to PT40M, schoolOnly=True
        t2 = trips[1]
        self.assertTrue(t2["schoolOnly"])
        self.assertEqual(
            t2["stops"],
            [
                ["670000101", "15:20"],
                ["670000201", "16:00"],
                ["090012345", "17:07"],
            ],
        )

    def test_txc_24_namespaces_and_non_dg_filtering(self) -> None:
        self.assertIsNone(ingest.parse_txc_xml(TXC_24_NON_DG_XML))

        parsed = ingest.parse_txc_xml(TXC_24_DG_XML)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(len(parsed["trips"]), 1)
        trip = parsed["trips"][0]
        self.assertEqual(trip["lineName"], "D3")
        self.assertEqual(trip["direction"], "inbound")
        self.assertEqual(trip["days"], ["Sat", "Sun"])
        self.assertTrue(trip["nonSchoolOnly"])
        self.assertEqual(trip["stops"], [["670000102", "09:05"], ["670000101", "09:17"]])

    def test_end_to_end_cli(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            naptan_path = tmp_path / "naptan.csv"
            naptan_path.write_text(SAMPLE_NAPTAN_CSV, encoding="utf-8")

            zip_path = tmp_path / "S.zip"
            with zipfile.ZipFile(zip_path, "w") as zf:
                zf.writestr("route79.xml", TXC_21_XML)
                zf.writestr("glasgow_only.xml", TXC_24_NON_DG_XML)
                zf.writestr("routeD3.xml", TXC_24_DG_XML)

            out_dir = tmp_path / "out"
            exit_code = ingest.main(
                [
                    "--local-naptan",
                    str(naptan_path),
                    "--local-tnds",
                    str(zip_path),
                    "--output-dir",
                    str(out_dir),
                    "--reference-date",
                    "2026-11-20",
                ]
            )
            self.assertEqual(exit_code, 0)

            stops = json.loads((out_dir / "stops.json").read_text(encoding="utf-8"))
            routes = json.loads((out_dir / "routes.json").read_text(encoding="utf-8"))
            meta = json.loads((out_dir / "metadata.json").read_text(encoding="utf-8"))

            # 3 NaPTAN stops + 1 cross-border Carlisle stop enriched from TXC
            self.assertEqual(len(stops), 4)
            self.assertEqual(len(routes), 2)
            self.assertEqual(meta["tripCount"], 3)
            self.assertEqual(meta["routeCount"], 2)
            self.assertEqual(meta["source"], "live")

            # Verify schedule JSON file exists and is valid
            r79 = next(r for r in routes if r["lineName"] == "79")
            sched = json.loads(
                (out_dir / "schedules" / f"{r79['id']}.json").read_text(encoding="utf-8")
            )
            self.assertEqual(len(sched["outbound"]), 2)
            self.assertEqual(sched["outboundLabel"], "Towards Carlisle")


if __name__ == "__main__":
    unittest.main()
