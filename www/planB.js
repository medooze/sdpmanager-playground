const url = "wss://"+window.location.hostname+":"+window.location.port;

function addRemoteTrack(event)
{
	console.log(event);
	
	const track	= event.track;
	const stream	= event.streams[0];
	
	if (!stream)
		return console.log("addRemoteTrack() no stream")
	
	stream.oninactive = (event)=>{
		console.log(event);
		removeRemoteStream(stream)
	};
	
	//Check if video is already present
	let video = remoteVideos.querySelector("div[id='"+stream.id+"']>video");
	
	//Check if already present
	if (video)
		//Ignore
		return console.log("addRemoteTrack() video already present for "+stream.id);
	
	//Create html stuff
	const div	= document.createElement("div");
	video		= document.createElement("video");
	
	//Set id
	div.id = stream.id;
	
	//Set video source
	video.srcObject = stream;
	
	//Play it
	video.autoplay = true;
	video.playsInline = true;
	video.play();
	
	//Add them
	div.appendChild(video);
	remoteVideos.append(div);
	
	return div;
}

function removeRemoteStream(stream)
{
	
	//Check if video is already present
	let div = remoteVideos.querySelector("div[id='"+stream.id+"']");
	
	//Check if already present
	if (!div)
		//Ignore
		return console.log("removeRemoteTrack() video not present for "+stream.id);
	
	remoteVideos.removeChild(div);
	
	return div;
}

function createLocalStream(i)
{
	//Create new canvs
	const canvas = document.createElement("canvas");
	//Fix width and height so encoding is not too expensive
	canvas.height = 64;
	canvas.width = 64;
	
	//Draw number
	var ctx = canvas.getContext("2d");
	
	//Periodically update it
	let num = 0;
	canvas.timer = setInterval(()=>{
		var ctx = canvas.getContext("2d");
		ctx.beginPath();
		ctx.fillStyle = "white";
		ctx.fillRect(0,0,64,64);
		ctx.fillStyle = "red";
		ctx.font = "32pt Arial";
		ctx.fillText(i,20,48);
		ctx.lineWidth = 6;
		ctx.strokeStyle = 'white';
		ctx.arc(32,32,20,0,2*Math.PI);
		ctx.stroke();
		ctx.beginPath();
		ctx.lineWidth = 4;
		ctx.strokeStyle = 'black';
		ctx.arc(32,32,20,-Math.PI/2,-Math.PI/2 + (num++%11)*Math.PI/5);
		ctx.stroke();
	},100);
	
	return canvas;
}

function addLocalStream(track,stream)
{
	//Create html stuff
	const div	= document.createElement("div");
	const video	= document.createElement("video");
	const button	= document.createElement("button");
	div.style.width = "64px";
	button.innerText= "delete"; 
	
	//Set video source (no  audio tracks in demo)
	video.srcObject = stream;
	
	//Add them
	div.appendChild(video);
	div.appendChild(button);
	localVideos.append(div);
	
	//Start playing
	video.muted = true;
	video.autoplay = true;
	video.play();
	
	return button;
}

let pc;
let streams = 0;
const AudioContext = window.AudioContext || window.webkitAudioContext;

async function sendTrack()
{
		//Create new canvas
		const canvas = createLocalStream(streams++);
		//Get stream
		const stream = canvas.captureStream();
		//Get video track
		const videoTrack = stream.getVideoTracks()[0];

		//Create audio track
		var audioContext = new AudioContext();
		var oscilator = audioContext.createOscillator();
		var audioTrack = audioContext.createMediaStreamDestination().stream.getAudioTracks()[0];

		//Add to stream
		stream.addTrack(audioTrack);
		//Add local video
		const button = addLocalStream(videoTrack,stream);
		
		//Add to pc
		const [audioSender,videoSender] = await Promise.all([pc.addTrack(audioTrack,stream),pc.addTrack(videoTrack,stream)]);

		//Remove 
		button.onclick = () => {
			//Remove without  wait
			pc.removeTrack(audioSender);
			pc.removeTrack(videoSender);
			clearInterval(canvas.timer);
			localVideos.removeChild(button.parentNode);
		};
};
//Start everything
window.onload=()=>{
	//Connect with websocket
	const ws = new WebSocket(url,"plan-b");
	
	//Crete transaction manager 
	const tm = new TransactionManager(ws);
	
	//Start on open
	ws.onopen = async ()=>{
		
		//Create new managed pc 
		pc = new RTCPeerConnection({sdpSemantics:"plan-b"});
		
		//On new remote tracks
		pc.ontrack	= addRemoteTrack;
				
		//Add listeneres
		addTrack.onclick		= ()=> sendTrack();
		
		const offer = await pc.createOffer({
			offerToReceiveAudio: true,
			offerToReceiveVideo: true,
		});
		await pc.setLocalDescription(offer);
		const answer = await tm.cmd("offer",{sdp: offer.sdp});
		pc.setRemoteDescription({type:"answer",sdp:answer.sdp});
  
  
		const pending = [];
		let executing = false;
		
		const execute = async (renegotiation)=>{
			//Add to pending
			pending.push(renegotiation);
		
			//If executing already
			if (executing)
				//Do not run agin loop
				return;
			
			//Executing
			executing = true;
			//Execute all pending renegotiations
			while (pending.length)
				//Execute first
				await pending.shift()();
			//End execution
			executing = false;
		};
		
		pc.onnegotiationneeded = async ()=>{
			execute(async()=>{
				const offer = await pc.createOffer();
				await pc.setLocalDescription(offer);
				const answer = await tm.cmd("offer",{sdp: offer.sdp});
				return pc.setRemoteDescription({type:"answer",sdp:answer.sdp});
			});
		};
		
		
		tm.on("cmd",async (cmd)=>{
			switch(cmd.name)
			{
				case "offer":
					execute(async ()=>{
						await pc.setRemoteDescription({type:"offer",sdp:cmd.data.sdp});
						const answer = await pc.createAnswer();
						cmd.accept({sdp:answer.sdp});
						return pc.setLocalDescription(answer);
					});
					break;
				default:
					cmd.reject();
			}
		});
	};
};