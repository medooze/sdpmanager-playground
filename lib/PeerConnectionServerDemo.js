const TransactionManager = require("transaction-manager");
//Get the Medooze Media Server interface
const MediaServer = require("medooze-media-server");

//Get Semantic SDP objects
const SemanticSDP	= require("semantic-sdp");
const SDPInfo		= SemanticSDP.SDPInfo;
const MediaInfo		= SemanticSDP.MediaInfo;
const CandidateInfo	= SemanticSDP.CandidateInfo;
const DTLSInfo		= SemanticSDP.DTLSInfo;
const ICEInfo		= SemanticSDP.ICEInfo;
const StreamInfo	= SemanticSDP.StreamInfo;
const TrackInfo		= SemanticSDP.TrackInfo;
const Direction		= SemanticSDP.Direction;
const CodecInfo		= SemanticSDP.CodecInfo;


const Capabilities = {
	audio : {
		codecs		: ["opus"],
	},
	video : {
		codecs		: ["vp8"],
		rtx		: true,
		rtcpfbs		: [
			{ "id": "goog-remb"},
			{ "id": "transport-cc"},
			{ "id": "ccm", "params": ["fir"]},
			{ "id": "nack"},
			{ "id": "nack", "params": ["pli"]}
			
		],
		extensions	: [
			"urn:3gpp:video-orientation",
			"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
			"http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
			"urn:ietf:params:rtp-hdrext:toffse",
			"urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
			"urn:ietf:params:rtp-hdrext:sdes:mid",
		],
		simulcast	: true
	}
};
module.exports = function(request,protocol,endpoint)
{
	const connection = request.accept(protocol);
	
	//Create new transaction manager
	const tm = new TransactionManager(connection);
	
	//Create new sdp manager
	const mngr = endpoint.createSDPManager(protocol,Capabilities);
	
	//LIsten for remotelly created peer connections
	mngr.on("transport",(transport)=>{
		
		//transport.dump("/tmp/t.pcap");
		
		//Listen for incoming tracks
		transport.on("incomingtrack",(track,stream)=>{
			setTimeout(()=>{
				//Get stream id from remote id
				const outgoingStreamId = "remote-" + stream.getId();
				//Get stream
				let outgoingStream = transport.getOutgoingStream(outgoingStreamId);
				//If not found
				if (!outgoingStream)
					//Create it
					outgoingStream = transport.createOutgoingStream(outgoingStreamId);

				//Create ougoing track
				const outgoing = outgoingStream.createTrack(track.getMedia());
				//Send loopback
				outgoing.attachTo(track);
				//Listen remove events
				track.once("stopped",()=>{
					//Stop also ougoing
					outgoing.stop();
				});
			},1000);
		});
		
		//Close on disconnect
		connection.on("close",() => {
			//Stop transport an recorded
			transport.stop();
		});
	});
	
	mngr.on("renegotiationneeded", async ()=>{
		console.log("renegotiationneeded")
		try {
			const answer = await tm.cmd("offer",{sdp:mngr.createLocalDescription()});
			mngr.processRemoteDescription(answer.sdp);
		} catch(e){
			console.error(e);
		}
	});
	
	tm.on("cmd",(cmd)=>{
		console.log(cmd.name)
		switch(cmd.name)
		{
			case "offer":
				try	{
					mngr.processRemoteDescription(cmd.data.sdp);
					cmd.accept({sdp:mngr.createLocalDescription()});
				} catch(e){
					console.error(e);
				}
				break;
			default:
				cmd.reject();
		}
	});
	
};
